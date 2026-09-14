"use client";

import { useState } from "react";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import {
  REASON_GROUPS,
  DEFAULT_RESPONSE_DAYS,
  type ReasonGroupId,
} from "@/lib/moderation/chapter-removal-templates";
import { Alert, Field, Modal, Textarea } from "@/components/ui";

export type RemoveChapterPayload = {
  reasonGroup: ReasonGroupId;
  subReason: string | null;
  detail: string;
  responseDays: number;
};

/**
 * Modal chọn lý do gỡ (bắt buộc — xem api/admin/chapters/[chapterId]/route.ts
 * VÀ api/admin/books/[bookId]/route.ts, cùng 4 nhóm lý do) — dùng chung
 * cho CẢ cấp chương lẫn cấp truyện, ở 3 điểm gọi: bảng chương
 * admin/noi-dung/[bookId] (chapter-moderation-table.tsx), nút "Xóa" ở
 * author-panel.tsx trên trang đọc (reader.tsx), và bảng truyện
 * admin/noi-dung (content-table.tsx). `heading` do caller tự dựng câu
 * ("Gỡ chương "X""/"Xoá truyện "Y"") — component không giả định đối
 * tượng là chương hay truyện.
 */
export function RemoveChapterModal({
  heading,
  pending,
  onCancel,
  onConfirm,
}: {
  heading: string;
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
    // closeOnBackdrop=false — hành vi cũ (bấm nền không đóng), giữ nguyên:
    // đây là modal xác nhận GỠ chương/truyện, không muốn mất dữ liệu vừa
    // điền vì lỡ tay click ra ngoài.
    <Modal open onClose={onCancel} closeOnBackdrop={false} panelClassName="max-w-[480px] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[16px] font-bold text-brand-ink">{heading}</div>
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

        <div className="mb-3">
          <Textarea
            label={
              "Ghi chú thêm " +
              (groupInfo.subReasons.length === 0 && group !== "chua_xac_dinh" ? "(bắt buộc)" : "(tuỳ chọn)")
            }
            value={detail}
            onChange={(e) => {
              setDetail(e.target.value);
              setFormError(null);
            }}
            rows={3}
            placeholder="Ví dụ: chương 12, đoạn 3 sao chép nguyên văn từ..."
            className="resize-none"
          />
        </div>

        {groupInfo.invitesComplaint && (
          <div className="mb-3 w-24">
            <Field
              label="Số ngày tác giả có thể phản hồi"
              type="number"
              min={1}
              value={responseDays}
              onChange={(e) => setResponseDays(Math.max(1, Number(e.target.value) || DEFAULT_RESPONSE_DAYS))}
            />
          </div>
        )}

        {formError && (
          <div className="mb-3">
            <Alert tone="error">{formError}</Alert>
          </div>
        )}

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
            className="rounded-lg bg-error px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Đang gỡ…" : "Xác nhận gỡ"}
          </button>
        </div>
    </Modal>
  );
}
