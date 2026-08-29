"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SealCheckIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import {
  AUTHOR_PARTY_FIELD_LABELS,
  EXCLUSIVITY_CONTRACT_AGREEMENT_ID,
  PLATFORM_PARTY_INFO,
} from "@/lib/legal/contract-parties";

export type AgreementRow = {
  id: string;
  name: string;
  desc: string;
  updatedAt: string; // ISO yyyy-MM-dd
  requiredForFeature: string | null;
  accepted: boolean;
  updatedSincePending: boolean;
  acceptedAt: string | null;
};

type ContractInfo = {
  penName: string;
  realName: string | null;
  dateOfBirth: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  cccdNumber: string | null;
  cccdIssuedAt: string | null;
};

export function formatVi(iso: string): string {
  // "2026-08-22" -> "22-08-2026" — cùng định dạng dd-MM-yyyy đã dùng ở
  // thiết kế gốc (Vịnh Cá nhân.dc.html).
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Popup đọc toàn văn 1 thỏa thuận + xác nhận — dùng chung bởi tab "Cam kết
 * & Thỏa thuận" (agreements-tab.tsx) và popup chặn xuất bản truyện độc
 * quyền (required-agreements-modal.tsx), nên tách khỏi agreements-tab.tsx
 * thay vì để riêng ở đó.
 *
 * Với ĐÚNG 'chinh-sach-doc-quyen' (Hợp đồng khai thác tác phẩm độc quyền):
 * hiện thêm khối "Thông tin các bên" ở đầu nội dung — BÊN A tự lấy từ hồ
 * sơ tác giả (GET /api/profile/contract-info), BÊN B cố định
 * (contract-parties.ts) — để tác giả thấy ngay thông tin sẽ điền vào hợp
 * đồng mà không cần gõ tay. Các văn bản khác không có khái niệm 2 bên nên
 * không hiện khối này.
 */
export function AgreementDocumentViewer({
  row,
  html,
  onClose,
  onAccept,
  accepting,
}: {
  row: AgreementRow;
  html: string;
  onClose: () => void;
  onAccept: () => void;
  accepting: boolean;
}) {
  const isExclusivityContract = row.id === EXCLUSIVITY_CONTRACT_AGREEMENT_ID;
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  // Phân biệt "đang tải" (contractInfo null, contractInfoError null — hiện
  // "…") với "tải lỗi" (contractInfoError có giá trị — hiện thông báo rõ
  // thay vì để "…" treo mãi, vd khi DB production còn thiếu cột
  // date_of_birth/address/cccd_issued_at do chưa chạy
  // migrations/20260829_add_author_contract_fields.sql).
  const [contractInfoError, setContractInfoError] = useState(false);

  useEffect(() => {
    if (!isExclusivityContract) return;
    let cancelled = false;
    fetch("/api/profile/contract-info")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: ContractInfo) => {
        if (!cancelled) setContractInfo(data);
      })
      .catch(() => {
        if (!cancelled) setContractInfoError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isExclusivityContract]);

  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-[95] flex items-center justify-center bg-brand-ink-dark/55 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_24px_60px_rgba(0,0,0,.3)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#f0f0ef] px-[26px] pb-[18px] pt-[22px]">
          <div className="min-w-0">
            <div className="text-[11.5px] font-semibold tracking-[1.3px] text-brand-gold-dark">
              VĂN BẢN THỎA THUẬN
            </div>
            <div className="mt-[7px] font-[family-name:var(--font-lora)] text-xl font-bold text-brand-ink">
              {row.name}
            </div>
            <div className="mt-2 text-[12.5px] text-stone-light">
              {row.desc} · Cập nhật: {formatVi(row.updatedAt)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#f4f4f5] text-stone-dark"
          >
            <XIcon size={17} />
          </button>
        </div>
        <div className="overflow-y-auto px-[26px] py-6">
          {row.updatedSincePending && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#F0E3C4] bg-[#FBF0DC] px-3.5 py-3">
              <WarningCircleIcon weight="fill" size={17} color="#B7791F" className="mt-px shrink-0" />
              <div className="text-[12.5px] leading-[1.6] text-[#7a5a1f]">
                Văn bản này vừa được cập nhật ngày {formatVi(row.updatedAt)}. Xác nhận trước đó của bạn không còn
                hiệu lực — vui lòng đọc lại và xác nhận.
              </div>
            </div>
          )}

          {isExclusivityContract && (
            <div className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-cream-border bg-cream-card p-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-[11px] font-bold tracking-[1px] text-brand-gold-dark">
                  BÊN A · TÁC GIẢ (BẠN)
                </div>
                {contractInfoError ? (
                  <div className="text-[12.5px] leading-[1.5] text-[#B02A37]">
                    Không tải được thông tin của bạn. Vui lòng thử tải lại trang; nếu vẫn lỗi, báo cho quản trị
                    viên.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-1 text-[12.5px] text-stone-dark">
                      {AUTHOR_PARTY_FIELD_LABELS.map(({ key, label }) => {
                        const value = contractInfo?.[key];
                        const display =
                          key === "dateOfBirth" || key === "cccdIssuedAt"
                            ? value
                              ? formatVi(value)
                              : null
                            : value;
                        return (
                          <div key={key} className="flex justify-between gap-3">
                            <span className="text-stone-light">{label}</span>
                            <span className="text-right font-medium text-ink">
                              {display || (contractInfo ? "Chưa cập nhật" : "…")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {contractInfo && AUTHOR_PARTY_FIELD_LABELS.some(({ key }) => !contractInfo[key]) && (
                      <div className="mt-2 text-[11.5px] leading-[1.5] text-stone">
                        Bổ sung các trường còn thiếu ở mục &quot;Thông tin hợp đồng&quot; và &quot;Căn cước công dân&quot;
                        trong tab Thông tin cá nhân.
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <div className="mb-2 text-[11px] font-bold tracking-[1px] text-brand-gold-dark">
                  BÊN B · BÊN KHAI THÁC (VỊNH CÂU CHUYỆN)
                </div>
                <div className="flex flex-col gap-1 text-[12.5px] text-stone-dark">
                  {PLATFORM_PARTY_INFO.map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-3">
                      <span className="text-stone-light">{label}</span>
                      <span className="text-right font-medium text-ink">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div
            className="text-[14px] leading-[1.7] text-stone-dark [&_em]:text-stone [&_h1]:mt-6 [&_h1]:text-[16px] [&_h1]:font-bold [&_h1]:text-brand-ink [&_h1:first-child]:mt-0 [&_li]:mb-1.5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_strong]:font-semibold [&_strong]:text-brand-ink [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-[#f0f0ef] bg-[#fdfdfc] px-[26px] py-4">
          <div
            className="flex items-center gap-1.5 text-[13px] font-semibold"
            style={{ color: row.accepted ? "#2F7A4F" : row.updatedSincePending ? "#B7791F" : "var(--color-stone-light)" }}
          >
            {row.accepted && <SealCheckIcon weight="fill" size={16} />}
            {row.accepted
              ? `Đã xác nhận ngày ${row.acceptedAt ? formatVi(row.acceptedAt) : ""}`
              : row.updatedSincePending
                ? `Đã cập nhật ngày ${formatVi(row.updatedAt)} — cần xác nhận lại`
                : "Chưa xác nhận"}
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-full border border-cream-border px-5 py-2.5 text-[13.5px] font-medium text-stone-dark"
            >
              Đóng
            </button>
            {!row.accepted && (
              <button
                type="button"
                onClick={onAccept}
                disabled={accepting}
                className="cursor-pointer rounded-full bg-brand-gold px-[22px] py-2.5 text-[13.5px] font-semibold text-brand-ink disabled:cursor-default disabled:opacity-60"
              >
                Tôi đồng ý
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
