"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@phosphor-icons/react/dist/ssr";
import { getTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme";

// Server không biết lựa chọn của người dùng (nằm ở localStorage) — render
// "light" rồi client tự cập nhật sau hydrate, không gây hydration mismatch.
const getServerTheme = (): Theme => "light";

/**
 * Nút bật/tắt chế độ tối, đặt trên thanh nav màu brand-navy (xem
 * nav-bar-content.tsx) — nên icon luôn màu trắng ở cả 2 chế độ.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
      title={isDark ? "Chế độ sáng" : "Chế độ tối"}
      className={`h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-colors hover:bg-white/12 ${className}`}
    >
      {isDark ? <SunIcon size={21} /> : <MoonIcon size={21} />}
    </button>
  );
}
