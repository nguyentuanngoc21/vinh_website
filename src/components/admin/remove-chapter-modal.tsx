"use client";

import { useState } from "react";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import {
  REASON_GROUPS,
  DEFAULT_RESPONSE_DAYS,
  type ReasonGroupId,
} from "@/lib/moderation/chapter-removal-templates";

export type RemoveChapterPayload = {
  reasonGroup: ReasonGroupId;
  subReason: string | null;
  detail: string;
  responseDays: number;
};

/**
 * Modal chọn lý do gỡ chương (bắt buộc — xem
 * api/admin/chapters/[chapterId]/route.ts) — dùng chung cho cả 2 điểm gọi:
 * bảng chương ở admin/noi-dung/[bookId] (chapter-moderation-table.tsx) VÀ
 * nút "Xóa" ở author-panel.tsx trên chính trang đọc (reader.tsx), để admin
 * gỡ chương ngay tại chỗ đang đọc mà không cần vòng qua trang quản trị.
 * Tách ra file riêng thay vì định nghĩa lặp lại ở 2 nơi.
 */
export function RemoveChapterModal({
  chapterTitle,
  pending,
  onCancel,
  onConfirm,
}: {
  chapterTitle: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (payload: RemoveChapterPayload) => void;
}) {
  const [group, setGroup] = useState<ReasonGroupId>(REASON_GROUPS[0].id);
  const [subReason, setSubReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [responseDays, setResponseDays] = useState(DEFAULT_RESPONSE_DAYS);
  const [formError, setFormError] = useState<string | null>(null);

  const groupInfo = REASON_GROUPS.find((g) => g.id === group)!;
  const needsDetail = group !== "chua_xac_dinh" && !subReason && !detail.trim();

  const handleSubmit = () => {
    if (needsDetail) {
      setFormError("Vui lòng chọn 1 lý do cụ thể hoặc nhập chi tiết.");
      return;
    }
    onConfirm({ reasonGroup: group, subReason: subReason || null, detail: detail.trim(), responseDays });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-[480px] rounded-2xl bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,.25)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[16px] font-bold text-brand-ink">Gỡ chương &quot;{chapterTitle}&quot;</div>
          <button type="button" onClick={onCancel} className="cursor-pointer text-stone-alt hover:text-brand-ink">
            <XIcon size={18} />
          </button>
        </div>

        <label className="mb-1 block text-[12.5px] font-semibold text-stone-dark">Lý do gỡ</label>
        <select
          value={group}
          onChange={(e) => {
            setGroup(e.target.value as ReasonGroupId);
            setSubReason("");
            setFormError(null);
          }}
          className="mb-3 w-full rounded-lg border border-cream-border px-3 py-2 text-sm"
        >
          {REASON_GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>

        {groupInfo.subReasons.length > 0 && (
          <>
            <label className="mb-1 block text-[12.5px] font-semibold text-stone-dark">Lý do cụ thể</label>
            <select
              value={subReason}
              onChange={(e) => {
                setSubReason(e.target.value);
                setFormError(null);
              }}
              className="mb-3 w-full rounded-lg border border-cream-border px-3 py-2 text-sm"
            >
              <option value="">— Tự nhập bên dưới —</option>
              {groupInfo.subReasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="mb-1 block text-[12.5px] font-semibold text-stone-dark">
          Ghi chú thêm {groupInfo.subReasons.length === 0 && group !== "chua_xac_dinh" ? "(bắt buộc)" : "(tuỳ chọn)"}
        </label>
        <textarea
          value={detail}
          onChange={(e) => {
            setDetail(e.target.value);
            setFormError(null);
          }}
          rows={3}
          placeholder="Ví dụ: chương 12, đoạn 3 sao chép nguyên văn từ..."
          className="mb-3 w-full resize-none rounded-lg border border-cream-border px-3 py-2 text-sm"
        />

        {groupInfo.invitesComplaint && (
          <>
            <label className="mb-1 block text-[12.5px] font-semibold text-stone-dark">
              Số ngày tác giả có thể phản hồi
            </label>
            <input
              type="number"
              min={1}
              value={responseDays}
              onChange={(e) => setResponseDays(Math.max(1, Number(e.target.value) || DEFAULT_RESPONSE_DAYS))}
              className="mb-3 w-24 rounded-lg border border-cream-border px-3 py-2 text-sm"
            />
          </>
        )}

        {formError && <div className="mb-3 text-[12.5px] font-medium text-[#B02A37]">{formError}</div>}

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-cream-border px-4 py-2 text-[13px] font-semibold text-stone-dark"
          >
            Huỷ
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleSubmit}
            className="rounded-lg bg-[#B02A37] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Đang gỡ…" : "Xác nhận gỡ"}
          </button>
        </div>
      </div>
    </div>
  );
}
