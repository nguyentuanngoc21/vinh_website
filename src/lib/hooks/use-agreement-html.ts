"use client";

import { useCallback, useState } from "react";
import { AGREEMENT_ORDER, loadAgreementHtml, type AgreementId } from "@/lib/legal/agreement-meta";

const LOAD_ERROR = "Không tải được văn bản. Vui lòng kiểm tra kết nối và thử lại.";

function isAgreementId(id: string): id is AgreementId {
  return (AGREEMENT_ORDER as string[]).includes(id);
}

/**
 * Tải lười HTML của 1 văn bản pháp lý khi người dùng mở popup — cùng cách
 * LegalLink (src/components/legal/legal-link.tsx) làm, để tab "Cam kết &
 * Thỏa thuận" và popup chặn xuất bản không phải import registry.ts (kéo
 * HTML của cả 6 văn bản, ~170 KB, vào bundle). HTML đã tải được giữ lại
 * theo id, mở lại không tải lần nữa; lỗi lưu theo id và được xoá khi mở
 * lại để người dùng thử lại được.
 *
 *   const docs = useAgreementHtml();
 *   docs.open(id);            // gọi trong event handler lúc mở popup
 *   docs.htmlFor(id)          // null = đang tải
 *   docs.errorFor(id)         // thông báo lỗi tiếng Việt, hoặc null
 *   docs.isKnown(id)          // id có trong agreement-meta.ts không
 */
export function useAgreementHtml() {
  const [htmlById, setHtmlById] = useState<Partial<Record<AgreementId, string>>>({});
  const [errorById, setErrorById] = useState<Partial<Record<AgreementId, string>>>({});

  const open = useCallback(
    (id: string) => {
      if (!isAgreementId(id) || htmlById[id] !== undefined) return;
      setErrorById((prev) => ({ ...prev, [id]: undefined }));
      loadAgreementHtml(id)
        .then((html) => setHtmlById((prev) => ({ ...prev, [id]: html })))
        .catch(() => setErrorById((prev) => ({ ...prev, [id]: LOAD_ERROR })));
    },
    [htmlById]
  );

  return {
    open,
    isKnown: isAgreementId,
    htmlFor: (id: string): string | null => (isAgreementId(id) ? (htmlById[id] ?? null) : null),
    errorFor: (id: string): string | null => (isAgreementId(id) ? (errorById[id] ?? null) : null),
  };
}
