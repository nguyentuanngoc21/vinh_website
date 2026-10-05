"use client";

import { useState } from "react";
import { TrashIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { reasonGroupLabel, type ReasonGroupId } from "@/lib/moderation/chapter-removal-templates";
import { RemoveChapterModal, type RemoveChapterPayload } from "@/components/admin/remove-chapter-modal";
import { Alert, Button, Checkbox } from "@/components/ui";

export type ChapterModerationRow = {
  id: string;
  title: string;
  orderIndex: number;
  published: boolean;
  removedAt: string | null;
  /** Username admin đã gỡ (chapters.removed_by). */
  removedByUsername: string | null;
  removedReasonGroup: string | null;
  removedReasonDetail: string | null;
  /** not null = content đã bị rỗng hoá do gỡ quá 30 ngày (trực tiếp, HOẶC
   * gián tiếp vì cả sách đã bị xoá quá hạn) — xem
   * migrations/archive/20260908_add_content_purge_retention.sql. "Khôi phục" vô
   * nghĩa với hàng này. */
  contentPurgedAt: string | null;
};

const GRID_COLS = "grid-cols-[60px_1fr_150px_260px_160px]";

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
            ? { ...r, published: true, removedAt: null, removedByUsername: null, removedReasonGroup: null, removedReasonDetail: null }
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
                removedByUsername: data?.removed_by_username ?? null,
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
    <div className="rounded-[14px] border border-cream-border bg-surface p-[22px]">
      {/* w-fit — Checkbox là <button> flex (chiếm cả hàng); giữ vùng bấm chỉ quanh nhãn như cũ. */}
      <div className="mb-3.5 w-fit">
        <Checkbox checked={showPurged} onChange={() => setShowPurged((v) => !v)}>
          Hiện cả chương đã dọn nội dung (&gt;30 ngày)
        </Checkbox>
      </div>

      {error && <Alert tone="error" className="mb-3.5">{error}</Alert>}

      {/* overflow-x-auto — admin/layout.tsx bọc <main> bằng overflow-hidden
          (không cuộn được); bảng phải tự lo cuộn ngang của chính nó khi
          màn hình hẹp, không thì cột cuối (nút Gỡ/Khôi phục) bị cắt mất,
          không cách nào bấm được (xem bug tương tự đã xảy ra ở
          content-table.tsx). */}
      <div className="overflow-x-auto">
      <div className={`grid ${GRID_COLS} min-w-[740px] gap-3 border-b border-cream-border px-2.5 pb-2.5 text-xs font-semibold text-stone-alt`}>
        <div>#</div>
        <div>Chương</div>
        <div>Trạng thái</div>
        <div>Gỡ bởi / lý do</div>
        <div />
      </div>

      {visibleRows.map((r) => (
        <div
          key={r.id}
          className={`grid ${GRID_COLS} min-w-[740px] items-center gap-3 border-b border-line-warm px-2.5 py-[13px] text-sm font-medium text-ink-warm`}
        >
          <div className="text-stone-alt">{r.orderIndex}</div>
          <div className="truncate">{r.title}</div>
          <div>
            <span
              className={`rounded-full px-[11px] py-1 text-[11px] font-semibold ${
                r.removedAt
                  ? "bg-[#F8D7DA] dark:bg-error-bg text-error"
                  : r.published
                    ? "bg-success-form-border text-success-text"
                    : "bg-cream-card-alt text-stone-dark"
              }`}
            >
              {r.removedAt ? "Đã gỡ (admin)" : r.published ? "Đã đăng" : "Bản nháp"}
            </span>
          </div>
          <div className="min-w-0 text-xs text-stone-alt">
            {r.removedAt ? (
              <>
                <div className="truncate font-semibold text-stone-dark">
                  {new Date(r.removedAt).toLocaleDateString("vi-VN")}
                  {r.removedByUsername && ` · bởi @${r.removedByUsername}`}
                </div>
                <RemovalReasonText
                  text={`${reasonGroupLabel(r.removedReasonGroup as ReasonGroupId)}${
                    r.removedReasonDetail ? ` — ${r.removedReasonDetail}` : ""
                  }${r.contentPurgedAt ? " · Đã dọn nội dung" : ""}`}
                />
              </>
            ) : (
              "—"
            )}
          </div>
          <div className="flex justify-end">
            {r.contentPurgedAt ? (
              <span className="text-[12.5px] font-medium text-stone-light" title="Nội dung đã bị rỗng hoá, không thể khôi phục.">
                Không thể khôi phục
              </span>
            ) : r.removedAt ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                fullWidth={false}
                disabled={pendingId === r.id}
                onClick={() => restore(r.id)}
                className="gap-1.5"
              >
                <ArrowCounterClockwiseIcon size={14} /> Khôi phục
              </Button>
            ) : (
              <Button
                type="button"
                variant="danger-outline"
                size="sm"
                fullWidth={false}
                disabled={pendingId === r.id}
                onClick={() => setRemovingChapter(r)}
                className="gap-1.5"
              >
                <TrashIcon size={14} /> Gỡ chương
              </Button>
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

/** Lý do gỡ — cắt 2 dòng trong ô; bản đầy đủ ở tooltip (title). */
function RemovalReasonText({ text }: { text: string }) {
  return (
    <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug" title={text}>
      {text}
    </div>
  );
}
