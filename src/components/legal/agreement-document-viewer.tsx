"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SealCheckIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { AGREEMENT_PARTY_INFO } from "@/lib/legal/contract-parties";
import type { AgreementId } from "@/lib/legal/registry";

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

type PlatformParty = {
  name: string | null;
  idNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
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
  platformParty: PlatformParty;
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
 * Với BẤT KỲ văn bản nào có khai báo trong AGREEMENT_PARTY_INFO
 * (contract-parties.ts) — hiện tại là Hợp đồng khai thác tác phẩm độc
 * quyền (Bên A + Bên B) và Cam kết quyền sở hữu & chống đạo nhái (chỉ
 * Bên A) — hiện thêm khối "Thông tin các bên" ở đầu nội dung: Bên A tự
 * lấy từ hồ sơ tác giả đang xem, Bên B (nếu văn bản có) tự lấy từ hồ sơ
 * super_admin, đều qua GET /api/profile/contract-info. Văn bản không
 * khai báo gì ở đó (Điều khoản sử dụng, Chính sách bảo mật...) không có
 * chỗ trống nào cần điền nên không hiện khối này và không gọi API này.
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
  const partyInfoSpec = AGREEMENT_PARTY_INFO[row.id as AgreementId];
  const needsContractInfo = !!partyInfoSpec;
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  // Phân biệt "đang tải" (contractInfo null, contractInfoError null — hiện
  // "…") với "tải lỗi" (contractInfoError có giá trị — hiện thông báo rõ
  // thay vì để "…" treo mãi, vd khi DB production còn thiếu cột
  // date_of_birth/address/cccd_issued_at do chưa chạy
  // migrations/20260829_add_author_contract_fields.sql).
  const [contractInfoError, setContractInfoError] = useState(false);

  useEffect(() => {
    if (!needsContractInfo) return;
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
  }, [needsContractInfo]);

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

          {partyInfoSpec && (
            <div
              className={`mb-6 grid grid-cols-1 gap-4 rounded-xl border border-cream-border bg-cream-card p-4 ${
                partyInfoSpec.author && partyInfoSpec.platform ? "sm:grid-cols-2" : ""
              }`}
            >
              {partyInfoSpec.author && (
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
                        {partyInfoSpec.author.map(({ key, label }) => {
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
                      {contractInfo && partyInfoSpec.author.some(({ key }) => !contractInfo[key]) && (
                        <div className="mt-2 text-[11.5px] leading-[1.5] text-stone">
                          Bổ sung các trường còn thiếu ở mục &quot;Chỉnh sửa thông tin cá nhân&quot; và &quot;Căn cước
                          công dân&quot; trong tab Thông tin cá nhân.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {partyInfoSpec.platform && (
                <div>
                  <div className="mb-2 text-[11px] font-bold tracking-[1px] text-brand-gold-dark">
                    BÊN B · BÊN KHAI THÁC (VỊNH CÂU CHUYỆN)
                  </div>
                  {!contractInfoError && (
                    <div className="flex flex-col gap-1 text-[12.5px] text-stone-dark">
                      {partyInfoSpec.platform.map(({ key, label }) => {
                        const value = contractInfo?.platformParty[key];
                        return (
                          <div key={key} className="flex justify-between gap-3">
                            <span className="text-stone-light">{label}</span>
                            <span className="text-right font-medium text-ink">
                              {value || (contractInfo ? "Chưa cập nhật" : "…")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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
