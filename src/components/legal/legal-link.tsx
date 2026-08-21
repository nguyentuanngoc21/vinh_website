"use client";

import { useState, type ReactNode } from "react";
import { LegalDocumentModal } from "./legal-document-modal";
import { dieuKhoanSuDungHtml } from "@/lib/legal/dieu-khoan-su-dung";
import { chinhSachBaoMatHtml } from "@/lib/legal/chinh-sach-bao-mat";

const DOCS = {
  terms: { title: "Điều khoản sử dụng", html: dieuKhoanSuDungHtml },
  privacy: { title: "Chính sách bảo mật", html: chinhSachBaoMatHtml },
} as const;

type LegalLinkProps = {
  doc: keyof typeof DOCS;
  className?: string;
  children: ReactNode;
};

/**
 * Chữ "Điều khoản sử dụng" / "Chính sách bảo mật" dùng ở footer, form đăng
 * nhập/đăng ký — bấm vào mở LegalDocumentModal thay vì để text tĩnh. Mỗi
 * instance tự giữ state đóng/mở, không cần context chung.
 *
 * Render bằng <span role="button"> chứ không phải <button> thật: trong
 * register-form, LegalLink nằm bên trong children của Checkbox — mà Checkbox
 * tự nó là một <button> (xem ui/checkbox.tsx) — nên một <button> lồng trong
 * <button> sẽ là HTML không hợp lệ và bị trình duyệt tự "kéo" ra ngoài, vỡ
 * layout. stopPropagation để bấm link không đồng thời tick/untick checkbox.
 */
export function LegalLink({ doc, className = "", children }: LegalLinkProps) {
  const [open, setOpen] = useState(false);
  const target = DOCS[doc];

  const activate = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate(e);
          }
        }}
        className={`cursor-pointer underline-offset-2 hover:underline ${className}`}
      >
        {children}
      </span>
      <LegalDocumentModal open={open} onClose={() => setOpen(false)} title={target.title} html={target.html} />
    </>
  );
}
