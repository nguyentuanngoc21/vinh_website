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
