"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: ToastTone };

const ToastContext = createContext<{ show: (message: string, tone?: ToastTone) => void } | null>(null);

const TONE_CLASS: Record<ToastTone, string> = {
  success: "border-success-form-border bg-success-form-bg text-success-form",
  error: "border-error-border bg-error-bg text-error",
  info: "border-cream-border bg-cream-card text-stone-dark",
};

const TOAST_DURATION_MS = 2500;

/**
 * Ephemeral notification — the repo had no shared version of this before
 * (only an ad-hoc "copyBubble" string in reader.tsx, rendered inline next
 * to the Share button, no stacking, no portal). Tự viết (không thêm
 * dependency — không có sonner/react-hot-toast trong package.json và
 * quyết định giữ vậy, xem hội thoại review UI/UX).
 *
 * Mount 1 lần ở root layout (cạnh NavigationOverlay). Dùng cho thông báo
 * PHÙ DU (đã sao chép liên kết, đã xoá...) — lỗi validate tại chỗ trong
 * form vẫn nên dùng `Alert` (banner cố định, không tự biến mất), không
 * phải Toast.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          // z-[250]: dưới LoadingScreen (z-[300], xem loading-screen.tsx) và
          // NavigationOverlay, trên mọi Modal (z-[95]/z-[90], xem modal.tsx).
          // Vị trí: giữa-dưới trên mobile (đẩy lên khỏi FAB quick-action của
          // auth-cluster.tsx và MiniPlayerBar bằng bottom-24), góc dưới-phải
          // từ sm trở lên.
          <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[250] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:items-end">
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                className={`pointer-events-auto rounded-[var(--radius-md)] border px-4 py-2.5 text-[13px] font-medium shadow-[0_10px_30px_rgba(0,0,0,.12)] ${TONE_CLASS[t.tone]}`}
              >
                {t.message}
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast phải được gọi bên trong <ToastProvider>");
  return ctx;
}
