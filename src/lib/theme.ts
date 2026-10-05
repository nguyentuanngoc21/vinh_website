/**
 * Chế độ sáng/tối toàn site — lưu ở localStorage để lần mở web sau vẫn giữ
 * đúng giao diện người dùng bật lần cuối. Giá trị thật nằm ở thuộc tính
 * `data-theme` trên <html> (globals.css đổi toàn bộ token màu theo nó);
 * THEME_INIT_SCRIPT gắn thuộc tính đó TRƯỚC lần paint đầu tiên (chèn inline
 * trong app/layout.tsx), tránh nháy trắng khi người dùng đang ở chế độ tối.
 */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "vinh_theme";

/** Chạy đồng bộ trong <head>, trước khi body render — giữ ngắn và tự bọc
 * try/catch (localStorage có thể ném lỗi ở chế độ ẩn danh/chặn cookie). */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

const listeners = new Set<() => void>();

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Không lưu được (ẩn danh/chặn storage) — vẫn đổi giao diện cho phiên này.
  }
  listeners.forEach((l) => l());
}

/** Cho useSyncExternalStore — mọi ThemeToggle trên trang (mobile + desktop)
 * cùng cập nhật khi 1 cái được bấm. */
export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
