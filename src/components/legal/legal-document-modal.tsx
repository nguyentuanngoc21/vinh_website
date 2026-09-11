"use client";

import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { Modal } from "@/components/ui";

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
 * Dùng <Modal> (portal sẵn ra document.body) — quan trọng vì LegalLink có
 * thể được đặt bên trong Checkbox, mà Checkbox tự nó là một <button>
 * (ui/checkbox.tsx): render modal tại chỗ (không portal) sẽ khiến
 * backdrop/click-đóng nổi bọt lên và tick nhầm checkbox, và div lồng trong
 * button là cấu trúc DOM sai — đúng lý do Modal luôn portal cho MỌI modal,
 * không riêng file này.
 */
export function LegalDocumentModal({ open, onClose, title, html }: LegalDocumentModalProps) {
  return (
    <Modal open={open} onClose={onClose} panelClassName="flex max-h-[85vh] max-w-[720px] flex-col p-0">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-cream-border px-7 py-5">
        <div className="font-[family-name:var(--font-lora)] text-xl font-bold text-brand-ink">{title}</div>
        <button type="button" onClick={onClose} className="shrink-0 cursor-pointer text-stone">
          <XIcon size={20} />
        </button>
      </div>
      <div
        className="overflow-y-auto px-7 py-6 text-[14px] leading-[1.7] text-stone-dark [&_em]:text-stone [&_h1]:mt-6 [&_h1]:text-[16px] [&_h1]:font-bold [&_h1]:text-brand-ink [&_h1:first-child]:mt-0 [&_li]:mb-1.5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_strong]:font-semibold [&_strong]:text-brand-ink [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Modal>
  );
}
