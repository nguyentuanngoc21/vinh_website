"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WarningCircleIcon, ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr";
import { AGREEMENTS } from "@/lib/legal/registry";
import { AgreementDocumentViewer, type AgreementRow } from "@/components/legal/agreement-document-viewer";
import { acceptAgreement, missingInfoUrl } from "@/lib/legal/accept-agreement";

/**
 * Chặn "Xuất bản" khi truyện đang ở chế độ độc quyền nhưng tác giả chưa
 * xác nhận (hoặc xác nhận đã lỗi thời) Hợp đồng khai thác tác phẩm độc
 * quyền — server đã chặn thật (POST/PATCH books, PATCH chapters, xem
 * src/lib/authoring/exclusivity-agreement.ts), popup này chỉ là chỗ để
 * đọc + xác nhận NGAY TẠI ĐÂY thay vì rời trang, cộng 1 lối tắt sang tab
 * "Cam kết & Thỏa thuận" đầy đủ nếu tác giả muốn xem hết ở đó.
 *
 * `missingAgreementIds` đến thẳng từ response 403 của server (không tự
 * đoán) — xem author-workspace.tsx.
 */
export function RequiredAgreementsModal({
  missingAgreementIds,
  onClose,
  onAllAccepted,
}: {
  missingAgreementIds: string[];
  onClose: () => void;
  onAllAccepted: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AgreementRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/profile/agreements");
    if (!res.ok) return;
    const data: { agreements: AgreementRow[] } = await res.json();
    const missing = data.agreements.filter((a) => missingAgreementIds.includes(a.id) && !a.accepted);
    if (missing.length === 0) {
      onAllAccepted();
      return;
    }
    setRows(missing);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/agreements")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { agreements: AgreementRow[] } | null) => {
        if (cancelled || !data) return;
        const missing = data.agreements.filter((a) => missingAgreementIds.includes(a.id) && !a.accepted);
        if (missing.length === 0) {
          onAllAccepted();
        } else {
          setRows(missing);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept(id: string) {
    setAcceptingId(id);
    try {
      const result = await acceptAgreement(id);
      if (!result.ok) {
        if (result.missingFields?.length) {
          router.push(missingInfoUrl(id, result.missingFields));
        }
        return;
      }
      await reload();
    } finally {
      setAcceptingId(null);
    }
  }

  const openRow = rows?.find((r) => r.id === openId) ?? null;
  const openDoc = openId ? AGREEMENTS.find((a) => a.id === openId) : null;

  return (
    <>
      {createPortal(
        <div onClick={onClose} className="fixed inset-0 z-[95] flex items-center justify-center bg-brand-ink-dark/55 p-6">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] rounded-[18px] bg-white p-7 shadow-[0_24px_60px_rgba(0,0,0,.3)]"
          >
            <div className="flex items-start gap-3">
              <WarningCircleIcon weight="fill" size={24} color="var(--color-brand-gold-dark)" className="mt-0.5 shrink-0" />
              <div>
                <div className="text-lg font-bold text-brand-ink">
                  Bạn chưa đồng ý các chính sách để đăng tác phẩm
                </div>
                <div className="mt-1.5 text-[13.5px] leading-[1.6] text-stone-dark">
                  Truyện này đang ở chế độ độc quyền — cần xác nhận văn bản dưới đây trước khi xuất bản.
                </div>
              </div>
            </div>

            {rows === null ? (
              <div className="mt-5 text-[13.5px] text-stone-light">Đang tải…</div>
            ) : (
              <div className="mt-5 flex flex-col gap-2.5">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-cream-border bg-cream-card px-4 py-3"
                  >
                    <div className="min-w-0 text-[13.5px] font-semibold text-ink">{r.name}</div>
                    <button
                      type="button"
                      onClick={() => setOpenId(r.id)}
                      disabled={acceptingId === r.id}
                      className="shrink-0 cursor-pointer whitespace-nowrap rounded-lg border border-brand-ink bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-brand-ink disabled:cursor-default disabled:opacity-60"
                    >
                      Xem &amp; đồng ý
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-full border border-cream-border px-5 py-2.5 text-[13.5px] font-medium text-stone-dark"
              >
                Đóng
              </button>
              <Link
                href="/ca-nhan?tab=agree"
                className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-gold-dark no-underline"
              >
                Đi tới Cam kết &amp; Thỏa thuận <ArrowSquareOutIcon size={14} />
              </Link>
            </div>
          </div>
        </div>,
        document.body
      )}

      {openRow && openDoc && (
        <AgreementDocumentViewer
          row={openRow}
          html={openDoc.html}
          onClose={() => setOpenId(null)}
          onAccept={() => accept(openRow.id).then(() => setOpenId(null))}
          accepting={acceptingId === openRow.id}
        />
      )}
    </>
  );
}
