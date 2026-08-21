"use client";

import { createPortal } from "react-dom";
import { XIcon } from "@phosphor-icons/react/dist/ssr";

type LegalDocumentModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  html: string;
};

/**
 * Popup đọc Điều khoản sử dụng / Chính sách bảo mật. Nội dung là HTML tĩnh
 * chuyển từ file Word gốc (docs/*.docx) qua scripts/convert-legal-docs.mjs —
 * không gọi dịch vụ xem tài liệu bên ngoài nào khi hiển thị.
 *
 * Portal ra document.body: LegalLink có thể được đặt bên trong Checkbox —
 * mà Checkbox tự nó là một <button> (ui/checkbox.tsx) — nên nếu render modal
 * tại chỗ, backdrop/click-đóng sẽ nổi bọt lên và tick nhầm checkbox, và div
 * lồng trong button là cấu trúc DOM sai. Portal tránh cả hai vấn đề.
 *
 * Cùng pattern modal với author/create-work-modal.tsx: backdrop
 * onClick=onClose, panel onClick=stopPropagation, if(!open) return null.
 * `open` chỉ bật lên true từ một sự kiện click phía client (LegalLink), nên
 * tới lúc nhánh này chạy `document` chắc chắn đã tồn tại — không cần state
 * "đã mount" kiểu useEffect.
 */
export function LegalDocumentModal({ open, onClose, title, html }: LegalDocumentModalProps) {
  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-brand-ink-dark/55 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[720px] flex-col rounded-[20px] bg-white shadow-[0_24px_60px_rgba(0,0,0,.28)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-cream-border px-7 py-5">
          <div className="font-[family-name:var(--font-lora)] text-xl font-bold text-brand-ink">
            {title}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 cursor-pointer text-stone">
            <XIcon size={20} />
          </button>
        </div>
        <div
          className="overflow-y-auto px-7 py-6 text-[14px] leading-[1.7] text-stone-dark [&_em]:text-stone [&_h1]:mt-6 [&_h1]:text-[16px] [&_h1]:font-bold [&_h1]:text-brand-ink [&_h1:first-child]:mt-0 [&_li]:mb-1.5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_strong]:font-semibold [&_strong]:text-brand-ink [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>,
    document.body,
  );
}
