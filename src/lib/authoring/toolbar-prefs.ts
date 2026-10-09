/**
 * Thanh công cụ tuỳ chỉnh của trình soạn thảo: thứ tự + nút bị ẩn, lưu trên
 * trình duyệt (tuỳ chọn cá nhân, không cần đồng bộ). Nút ẩn vẫn dùng được
 * bằng phím tắt. Pure helpers + try/catch storage.
 */
export const TOOLBAR_ITEMS = [
  "undo", "redo", "bold", "italic", "heading", "quote", "divider", "image",
  "find", "tidy", "notebook", "names", "history", "keys",
] as const;
export type ToolbarItemId = (typeof TOOLBAR_ITEMS)[number];
export type ToolbarPrefs = { order: ToolbarItemId[]; hidden: ToolbarItemId[] };

export const TOOLBAR_LABEL: Record<ToolbarItemId, string> = {
  undo: "Hoàn tác", redo: "Làm lại", bold: "Đậm", italic: "Nghiêng", heading: "Tiêu đề nhỏ", quote: "Trích dẫn",
  divider: "Ngắt cảnh", image: "Chèn ảnh thiết kế", find: "Tìm và thay thế", tidy: "Chỉnh định dạng",
  notebook: "Sổ tay truyện", names: "Kiểm tra tên riêng", history: "Lịch sử phiên bản", keys: "Phím tắt",
};
export const DEFAULT_TOOLBAR: ToolbarPrefs = { order: [...TOOLBAR_ITEMS], hidden: [] };

const isItem = (x: unknown): x is ToolbarItemId => typeof x === "string" && (TOOLBAR_ITEMS as readonly string[]).includes(x);

/** Bỏ id lạ/trùng; nút mới (thêm sau khi tác giả đã lưu cài đặt) được nối vào cuối. */
export function normalizeToolbar(raw: unknown): ToolbarPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as { order?: unknown; hidden?: unknown };
  const order = [...new Set(Array.isArray(r.order) ? r.order.filter(isItem) : [])];
  for (const id of TOOLBAR_ITEMS) if (!order.includes(id)) order.push(id);
  const hidden = [...new Set(Array.isArray(r.hidden) ? r.hidden.filter(isItem) : [])];
  return { order, hidden };
}

export function moveItem(prefs: ToolbarPrefs, id: ToolbarItemId, delta: -1 | 1): ToolbarPrefs {
  const order = [...prefs.order];
  const i = order.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return prefs;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...prefs, order };
}

export function toggleHidden(prefs: ToolbarPrefs, id: ToolbarItemId): ToolbarPrefs {
  return { ...prefs, hidden: prefs.hidden.includes(id) ? prefs.hidden.filter(x => x !== id) : [...prefs.hidden, id] };
}

/** Thứ tự hiển thị, chỉ gồm nút đang có ở màn này (vd. không có Lịch sử khi tạo truyện mới). */
export function visibleItems(prefs: ToolbarPrefs, available: ToolbarItemId[]): ToolbarItemId[] {
  return prefs.order.filter(id => available.includes(id) && !prefs.hidden.includes(id));
}

const KEY = "vinh_editor_toolbar_v1";
export function readToolbarPrefs(): ToolbarPrefs {
  try { return normalizeToolbar(JSON.parse(localStorage.getItem(KEY) ?? "null")); } catch { return DEFAULT_TOOLBAR; }
}
export function writeToolbarPrefs(prefs: ToolbarPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

/** Bố cục trang viết trên desktop: trang rộng, chia đôi xem trước, cỡ chữ bản xem trước (khớp A−/A+ của reader.tsx). */
export type EditorLayoutPrefs = { wide: boolean; preview: boolean; previewFontSize: number };
export const DEFAULT_LAYOUT: EditorLayoutPrefs = { wide: false, preview: false, previewFontSize: 19 };
export const PREVIEW_FONT_MIN = 15;
export const PREVIEW_FONT_MAX = 26;

export function normalizeLayout(raw: unknown): EditorLayoutPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof EditorLayoutPrefs, unknown>>;
  const size = typeof r.previewFontSize === "number" && Number.isFinite(r.previewFontSize)
    ? Math.min(PREVIEW_FONT_MAX, Math.max(PREVIEW_FONT_MIN, Math.round(r.previewFontSize)))
    : DEFAULT_LAYOUT.previewFontSize;
  return { wide: r.wide === true, preview: r.preview === true, previewFontSize: size };
}

const LAYOUT_KEY = "vinh_editor_layout_v1";
export function readLayoutPrefs(): EditorLayoutPrefs {
  try { return normalizeLayout(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null")); } catch { return DEFAULT_LAYOUT; }
}
export function writeLayoutPrefs(prefs: EditorLayoutPrefs) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
