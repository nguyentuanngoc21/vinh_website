"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type ModalLayer = "base" | "nested";

// Giữ đúng 2 giá trị z-index đã dùng thật trong 8 modal tự chế trước khi có
// component này (z-[95] cho modal chính, z-[90] cho modal phụ mở SAU khi 1
// modal z-[95] đã đóng — ví dụ success-modal.tsx mở sau custom-amount-modal.tsx)
// — không bịa thang z-index mới. z-[70] (remove-chapter-modal.tsx, modal
// nhúng trong 1 panel admin, không cạnh tranh lớp với 2 modal kia) không nằm
// trong 2 giá trị chuẩn này — dùng `layer="base"` (95) là đủ nếu modal đó
// không thực sự cần thấp hơn 95 trong bối cảnh mới (đứng một mình, không mở
// chồng lên modal khác).
const LAYER_Z: Record<ModalLayer, number> = { base: 95, nested: 90 };

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  layer?: ModalLayer;
  /** Bấm vào nền tối có đóng modal không — mặc định có. Đặt `false` cho các
   * modal xác nhận quan trọng (ví dụ remove-chapter-modal) muốn người dùng
   * bấm rõ nút Huỷ/Xác nhận thay vì lỡ tay click ra ngoài. */
  closeOnBackdrop?: boolean;
  /** Max-width và padding của panel — BẮT BUỘC truyền, không có mặc định.
   * 8 modal cũ trước component này mỗi cái dùng 1 max-width và 1 mức
   * padding khác nhau (p-6/p-7/p-8/p-0) — nếu đặt 1 default cố định rồi để
   * panelClassName "ghi đè" bằng cách nối chuỗi, class ghi đè có thể KHÔNG
   * thắng (thứ tự utility trong CSS Tailwind build ra quyết định thắng-thua,
   * không phải thứ tự viết trong className — xem bài học tương tự ở
   * button.tsx `fullWidth`). Bắt buộc truyền đủ ở đây tránh hẳn lớp lỗi đó:
   * không có 2 class cùng thuộc tính (vd 2 max-w-*) nào cùng tồn tại trong
   * chuỗi class cuối cùng. Bo góc + shadow vẫn cố định trong base (xem
   * dưới) — đó là 2 chỗ CỐ Ý thống nhất lại (trước đây rounded-2xl/[18px]/
   * [20px] rải rác không lý do), không phải chỗ cần mỗi modal tự khác. */
  panelClassName: string;
};

/**
 * Khung dùng chung cho mọi modal — thay 8 chỗ tự chế khung
 * backdrop/panel/z-index (custom-amount-modal, success-modal,
 * reading-list-modal, remove-chapter-modal, import-manuscript-modal,
 * required-agreements-modal, legal-document-modal, login-gate-modal).
 * Luôn portal vào document.body (2/8 file cũ đã làm vì lý do chính đáng —
 * thoát khỏi 1 <button>/Checkbox cha — áp dụng cho cả 8 để nhất quán, không
 * có lý do gì để 6 modal còn lại KHÔNG portal).
 *
 * Bổ sung mới so với mọi bản cũ: đóng bằng phím Escape, focus phần tử
 * focusable đầu tiên trong panel khi mở, trả focus về phần tử đã trigger mở
 * modal khi đóng — không file nào trong 8 file cũ có any trong 3 việc này.
 */
export function Modal({
  open,
  onClose,
  children,
  layer = "base",
  closeOnBackdrop = true,
  panelClassName,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;

    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy lại khi open đổi, không phải khi onClose đổi identity mỗi render
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{ zIndex: LAYER_Z[layer] }}
      className="fixed inset-0 flex items-center justify-center bg-brand-ink-dark/55 p-6"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`w-full rounded-[var(--radius-xl)] bg-white shadow-[0_24px_60px_rgba(0,0,0,.28)] ${panelClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
