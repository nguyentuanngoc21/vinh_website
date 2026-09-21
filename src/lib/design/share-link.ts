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
