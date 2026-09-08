"use client";

import { useState } from "react";
import { TrashIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { reasonGroupLabel, type ReasonGroupId } from "@/lib/moderation/chapter-removal-templates";
import { RemoveChapterModal, type RemoveChapterPayload } from "@/components/admin/remove-chapter-modal";

export type ChapterModerationRow = {
  id: string;
  title: string;
  orderIndex: number;
  published: boolean;
  removedAt: string | null;
  removedReasonGroup: string | null;
  removedReasonDetail: string | null;
  /** not null = content đã bị rỗng hoá do gỡ quá 30 ngày (trực tiếp, HOẶC
   * gián tiếp vì cả sách đã bị xoá quá hạn) — xem
   * migrations/20260908_add_content_purge_retention.sql. "Khôi phục" vô
   * nghĩa với hàng này. */
  contentPurgedAt: string | null;
};

const GRID_COLS = "grid-cols-[60px_1fr_150px_220px_160px]";

/**
 * Bảng chương cho src/app/admin/noi-dung/[bookId]/page.tsx. "Gỡ chương"
 * mở modal chọn lý do (bắt buộc — xem api/admin/chapters/[chapterId]/route.ts);
 * "Khôi phục" gọi thẳng, không cần modal (đối xứng đơn giản, không có gì
 * phải chọn thêm).
 */
export function ChapterModerationTable({ rows: initialRows }: { rows: ChapterModerationRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingChapter, setRemovingChapter] = useState<ChapterModerationRow | null>(null);
  // Mặc định ẩn — chương đã dọn nội dung (quá 30 ngày) không thể khôi
  // phục nữa, giữ khỏi làm rối bảng; vẫn bật lên được để đối chiếu.
  const [showPurged, setShowPurged] = useState(false);
  const visibleRows = showPurged ? rows : rows.filter((r) => !r.contentPurgedAt);

  const restore = async (id: string) => {
    if (pendingId) return;
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/chapters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && typeof data.error === "string" && data.error) || "Không khôi phục được.");
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, published: true, removedAt: null, removedReasonGroup: null, removedReasonDetail: null }
            : r
        )
      );
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (payload: RemoveChapterPayload) => {
    if (!removingChapter || pendingId) return;
    const id = removingChapter.id;
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/chapters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", ...payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && typeof data.error === "string" && data.error) || "Không gỡ được chương.");
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                published: false,
                removedAt: new Date().toISOString(),
                removedReasonGroup: payload.reasonGroup,
                removedReasonDetail: payload.detail || null,
              }
            : r
        )
      );
      setRemovingChapter(null);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      <label className="mb-3.5 flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium text-stone-alt">
        <input
          type="checkbox"
          checked={showPurged}
          onChange={(e) => setShowPurged(e.target.checked)}
          className="cursor-pointer"
        />
        Hiện cả chương đã dọn nội dung (&gt;30 ngày)
      </label>

      {error && (
        <div className="mb-3.5 rounded-lg border border-[#f3c6c6] bg-[#fdf1f1] px-3 py-2.5 text-[12.5px] font-medium text-[#B02A37]">
          {error}
        </div>
      )}

      {/* overflow-x-auto — admin/layout.tsx bọc <main> bằng overflow-hidden
          (không cuộn được); bảng phải tự lo cuộn ngang của chính nó khi
          màn hình hẹp, không thì cột cuối (nút Gỡ/Khôi phục) bị cắt mất,
          không cách nào bấm được (xem bug tương tự đã xảy ra ở
          content-table.tsx). */}
      <div className="overflow-x-auto">
      <div className={`grid ${GRID_COLS} min-w-[700px] gap-3 border-b border-cream-border px-2.5 pb-2.5 text-xs font-semibold text-stone-alt`}>
        <div>#</div>
        <div>Chương</div>
        <div>Trạng thái</div>
        <div>Lý do gỡ</div>
        <div />
      </div>

      {visibleRows.map((r) => (
        <div
          key={r.id}
          className={`grid ${GRID_COLS} min-w-[700px] items-center gap-3 border-b border-[#F1ECE0] px-2.5 py-[13px] text-sm font-medium text-[#3a352e]`}
        >
          <div className="text-stone-alt">{r.orderIndex}</div>
          <div className="truncate">{r.title}</div>
          <div>
            <span
              className={`rounded-full px-[11px] py-1 text-[11px] font-semibold ${
                r.removedAt
                  ? "bg-[#F8D7DA] text-[#B02A37]"
                  : r.published
                    ? "bg-[#DBF3E8] text-[#2C7453]"
                    : "bg-cream-card-alt text-stone-dark"
              }`}
            >
              {r.removedAt ? "Đã gỡ (admin)" : r.published ? "Đã đăng" : "Bản nháp"}
            </span>
          </div>
          <div className="truncate text-xs text-stone-alt">
            {r.removedAt
              ? `${reasonGroupLabel(r.removedReasonGroup as ReasonGroupId)}${
                  r.removedReasonDetail ? ` — ${r.removedReasonDetail}` : ""
                }${r.contentPurgedAt ? " · Đã dọn nội dung" : ""}`
              : "—"}
          </div>
          <div className="flex justify-end">
            {r.contentPurgedAt ? (
              <span className="text-[12.5px] font-medium text-stone-light" title="Nội dung đã bị rỗng hoá, không thể khôi phục.">
                Không thể khôi phục
              </span>
            ) : r.removedAt ? (
              <button
                type="button"
                disabled={pendingId === r.id}
                onClick={() => restore(r.id)}
                className="flex items-center gap-1.5 rounded-lg border border-cream-border px-3 py-1.5 text-[12.5px] font-semibold text-brand-ink disabled:opacity-50"
              >
                <ArrowCounterClockwiseIcon size={14} /> Khôi phục
              </button>
            ) : (
              <button
                type="button"
                disabled={pendingId === r.id}
                onClick={() => setRemovingChapter(r)}
                className="flex items-center gap-1.5 rounded-lg border border-[#f3c6c6] px-3 py-1.5 text-[12.5px] font-semibold text-[#B02A37] disabled:opacity-50"
              >
                <TrashIcon size={14} /> Gỡ chương
              </button>
            )}
          </div>
        </div>
      ))}
      </div>

      {rows.length === 0 && (
        <div className="px-2.5 py-6 text-center text-sm text-stone-light">Truyện này chưa có chương nào.</div>
      )}
      {rows.length > 0 && visibleRows.length === 0 && (
        <div className="px-2.5 py-6 text-center text-sm text-stone-light">
          Mọi chương ở đây đều đã dọn nội dung — bật &quot;Hiện cả chương đã dọn nội dung&quot; để xem.
        </div>
      )}

      {removingChapter && (
        <RemoveChapterModal
          heading={`Gỡ chương "${removingChapter.title}"`}
          pending={pendingId === removingChapter.id}
          onCancel={() => setRemovingChapter(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
