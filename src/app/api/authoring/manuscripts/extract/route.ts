import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { createClient } from "@/lib/supabase/server";

// ~4.5MB là giới hạn body thật của Vercel Route Handler cho Route Handlers
// (không cấu hình được lớn hơn) — giữ dư 0.5MB làm biên an toàn.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/**
 * POST /api/authoring/manuscripts/extract — chỉ dùng cho file .docx.
 * mammoth cần Buffer Node để đọc zip/XML nên không chạy được (nhẹ nhàng)
 * trong bundle client — .txt và văn bản dán tay được đọc thẳng ở
 * import-manuscript-modal.tsx (file.text() / state có sẵn), không gọi
 * route này. Route chỉ trả về TEXT thô; việc tách chương
 * (split-chapters.ts) luôn chạy ở client để giữ logic tách chương ở đúng
 * 1 nơi.
 *
 * Yêu cầu đăng nhập dù không ghi DB — chặn lạm dụng CPU của 1 endpoint
 * parse file công khai.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Vui lòng chọn 1 file .docx." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json(
      { error: "Chỉ hỗ trợ file .docx (không hỗ trợ .doc hoặc .epub)." },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File quá lớn — tối đa ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))}MB.` },
      { status: 413 }
    );
  }

  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    for (const message of result.messages) {
      if (message.type === "warning") console.warn("[manuscripts/extract]", message.message);
    }
    text = result.value;
  } catch (error) {
    console.error("[manuscripts/extract] mammoth failed:", error);
    return NextResponse.json({ error: "File .docx không hợp lệ hoặc bị hỏng." }, { status: 400 });
  }

  if (!text.trim()) {
    return NextResponse.json(
      { error: "Không tìm thấy nội dung văn bản trong file này." },
      { status: 400 }
    );
  }

  return NextResponse.json({ text });
}
