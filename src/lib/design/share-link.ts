const DESIGN_SHARE_LINK_PATH = "/lien-ket-thiet-ke";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Nhận diện 1 chuỗi có ĐÚNG là link chia sẻ thiết kế của chính nền tảng
 * (path /lien-ket-thiet-ke — không hard-code domain, vì dev/staging chạy
 * origin khác production) và trả về design_item id trong đó, BỎ QUA
 * token — hiển thị ảnh đọc qua public_design_items (đã công khai) không
 * cần token, token chỉ để xác thực quyền CHÈN marker lúc tác giả dán link
 * (xem POST /api/design/resolve-link). Dùng CHUNG ở cả nơi trích id để
 * tải ảnh (read/[bookSlug]/[chapterId]/page.tsx) và nơi render
 * (reader.tsx) — 1 nguồn duy nhất cho "thế nào là link của nền tảng",
 * tránh 2 nơi tự định nghĩa lệch nhau.
 */
export function extractDesignShareLinkId(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.pathname !== DESIGN_SHARE_LINK_PATH) return null;
  const id = url.searchParams.get("id");
  return id && UUID_RE.test(id) ? id : null;
}

/**
 * "Whitelist" bước 1 (thuần cấu trúc, KHÔNG network) trước khi tốn 1 lượt
 * gọi /api/design/resolve-link — dùng ở paste handler (chapter-editor.tsx)
 * để quyết định có nên preventDefault() + xác thực hay cứ để trình duyệt
 * dán chữ như thường. Khác extractDesignShareLinkId (id-only, cho ĐỌC):
 * chỗ này đòi cả token vì đây là bước CHÈN — resolve-link cần token để xác
 * thực quyền, thiếu token thì chưa đáng gọi API.
 */
export function isDesignShareLinkShape(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  return url.pathname === DESIGN_SHARE_LINK_PATH && !!url.searchParams.get("id") && !!url.searchParams.get("token");
}

// Khớp marker `[[thiet-ke:<id>]]` HOẶC bất kỳ URL http(s) nào (lọc lại
// bằng extractDesignShareLinkId ngay dưới — không lặp check path ở 2 chỗ).
const EMBEDDED_IMAGE_RE = /\[\[thiet-ke:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]|https?:\/\/\S+/g;

export type ParagraphImagePart = { type: "text"; text: string } | { type: "image"; id: string; raw: string };

/**
 * Tách 1 đoạn văn thành chuỗi [text, ảnh, text, ...]. Nhận marker HOẶC
 * nguyên link chia sẻ ở BẤT KỲ vị trí nào trong đoạn — KHÔNG còn đòi phải
 * chiếm nguyên cả đoạn/dòng như trước. Lý do đổi: không có cách nào từ
 * phía server biết chắc tác giả có thực sự tạo 1 dòng trống thật (\n\n)
 * quanh link hay chỉ dán giữa văn bản liền mạch rồi trình duyệt tự xuống
 * dòng khi hiển thị — nhiều tác giả dán link giữa 2 câu văn vẫn mong ảnh
 * hiện ra. reader.tsx dùng để render; nếu đoạn không có link/marker nào,
 * luôn trả về đúng 1 phần "text" giữ NGUYÊN VĂN đoạn gốc — không đổi hành
 * vi của những đoạn văn bình thường (bôi đen/bình luận vẫn theo pipeline
 * cũ, xem reader.tsx).
 */
export function splitParagraphAroundDesignImages(paragraph: string): ParagraphImagePart[] {
  const parts: ParagraphImagePart[] = [];
  let lastIndex = 0;
  for (const match of paragraph.matchAll(EMBEDDED_IMAGE_RE)) {
    const id = match[1] ?? extractDesignShareLinkId(match[0]);
    if (!id) continue; // URL http(s) khác, không thuộc nền tảng -> giữ nguyên là text
    const start = match.index ?? 0;
    if (start > lastIndex) parts.push({ type: "text", text: paragraph.slice(lastIndex, start) });
    parts.push({ type: "image", id, raw: match[0] });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < paragraph.length || parts.length === 0) {
    parts.push({ type: "text", text: paragraph.slice(lastIndex) });
  }
  return parts;
}

/**
 * Toàn bộ design_item id được nhắc tới trong `content` (marker hoặc link
 * thô, ở bất kỳ đâu) — dùng ở read/[bookSlug]/[chapterId]/page.tsx để tải
 * trước ảnh theo lô TRƯỚC khi render, tránh reader.tsx phải tự gọi thêm
 * request. Cùng 1 quy tắc nhận diện với splitParagraphAroundDesignImages
 * (dùng chung EMBEDDED_IMAGE_RE) — quét thẳng trên `content`, không cần
 * tách đoạn trước vì kết quả id thu được giống nhau dù tách hay không.
 */
export function extractAllDesignImageIds(content: string): string[] {
  const ids = [...content.matchAll(EMBEDDED_IMAGE_RE)].map((m) => m[1] ?? extractDesignShareLinkId(m[0]));
  return [...new Set(ids.filter((id): id is string => id !== null))];
}
