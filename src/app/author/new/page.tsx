import type { Metadata } from "next";
import { NewWorkWorkspace } from "@/components/author/new-work-workspace";

export const metadata: Metadata = { title: "Tác phẩm mới · Vịnh Tác giả" };

/**
 * /author/new — route TĨNH (Next.js ưu tiên khớp segment tĩnh "new"
 * trước segment động [bookId], nên không đụng
 * src/app/author/[bookId]/page.tsx). KHÔNG query/ghi Supabase gì ở đây —
 * chỉ render editor rỗng phía client; auth đã được gate ở
 * src/app/author/layout.tsx (cha). Việc tạo book+chapter thật chỉ xảy ra
 * lúc bấm Lưu/Xuất bản lần đầu trong NewWorkWorkspace.
 */
export default function NewWorkPage() {
  return <NewWorkWorkspace />;
}
