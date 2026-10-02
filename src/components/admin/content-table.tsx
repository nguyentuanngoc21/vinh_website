"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowSquareOutIcon, MagnifyingGlassIcon, TrashIcon, ArrowCounterClockwiseIcon, BookOpenTextIcon, LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import { RemoveChapterModal, type RemoveChapterPayload } from "@/components/admin/remove-chapter-modal";
import { Alert, Button, Checkbox, Select } from "@/components/ui";
import { ExclusivityModal } from "@/components/admin/exclusivity-modal";
import { AgeRatingModal } from "@/components/admin/age-rating-modal";
import { AGE_RATING_LABELS, type AgeRating } from "@/lib/age-rating";
import { reasonGroupLabel, type ReasonGroupId } from "@/lib/moderation/chapter-removal-templates";

export type ContentBookRow = {
  id: string;
  title: string;
  slug: string;
  authorUsername: string;
  published: boolean;
  isExclusive: boolean;
  ageRating: AgeRating;
  /** Admin đã khoá nhãn độ tuổi (tác giả không tự sửa được). */
  ageRatingLocked: boolean;
  deletedAt: string | null;
  /** Username admin đã xoá (books.removed_by). null khi đã xoá = tác giả tự
   * xoá (route tác giả chỉ set deleted_at, không ghi removed_by). */
  removedByUsername: string | null;
  removedReasonGroup: string | null;
  removedReasonDetail: string | null;
  /** not null = đã dọn nội dung nặng (cover/synopsis + content mọi
   * chương) do xoá quá 30 ngày — xem
   * migrations/archive/20260908_add_content_purge_retention.sql. "Khôi phục" vô
   * nghĩa với hàng này (nội dung đã rỗng), nên ẩn mặc định + tắt nút. */
  contentPurgedAt: string | null;
};

const AGE_FILTERS = [
  { id: "any", label: "Mọi nhãn độ tuổi" },
  { id: "all", label: "Mọi lứa tuổi" },
  { id: "16", label: "16+" },
  { id: "18", label: "18+" },
  { id: "unlocked", label: "Nhãn chưa khoá (chưa rà)" },
  { id: "locked", label: "Nhãn đã khoá" },
] as const;
type AgeFilter = (typeof AGE_FILTERS)[number]["id"];

function matchesAgeFilter(r: ContentBookRow, filter: AgeFilter): boolean {
  if (filter === "any") return true;
  if (filter === "locked") return r.ageRatingLocked;
  if (filter === "unlocked") return !r.ageRatingLocked;
  return r.ageRating === filter;
}

const GRID_COLS = "grid-cols-[1fr_160px_110px_130px_120px_230px_100px_190px]";

/**
 * Bảng quản lý truyện cho src/app/admin/noi-dung/page.tsx. Tìm kiếm lọc
 * ở CLIENT trong danh sách đã fetch (page.tsx giới hạn 200 dòng mới nhất
 * — không phải tìm kiếm toàn bộ DB, xem banner `truncated` bên dưới).
 * Mọi thao tác gọi PATCH /api/admin/books/:id (service-role, bỏ qua mọi
 * luật khoá của tác giả — đúng nghĩa override).
 */
export function ContentTable({
  rows: initialRows,
  truncated,
  fetchLimit,
}: {
  rows: ContentBookRow[];
  truncated: boolean;
  fetchLimit: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Chỉ "Xoá" (deleted:true) cần chọn lý do — bật/tắt độc quyền và
  // "Khôi phục" vẫn gọi patch() thẳng, không mở modal (đối xứng với
  // chapter-moderation-table.tsx: restore không cần modal).
  const [removingBook, setRemovingBook] = useState<ContentBookRow | null>(null);
  // Đổi độc quyền <-> tự do: xác nhận trước (pill trông như nhãn, dễ bấm
  // nhầm). Admin/super_admin bỏ qua khoá 3 ngày của tác giả; chỉ trigger
  // cuộc thi (D11) còn chặn — lỗi đó hiện ở Alert phía trên bảng.
  const [togglingBook, setTogglingBook] = useState<ContentBookRow | null>(null);
  // Sửa nhãn độ tuổi — modal tự tải nhãn/lịch sử và tự lưu (PUT
  // /api/admin/books/:id/age-rating), bảng chỉ cập nhật lại hàng khi xong.
  const [ratingBook, setRatingBook] = useState<ContentBookRow | null>(null);
  // Mặc định ẩn — hàng đã dọn nội dung (quá 30 ngày) không còn thao tác gì
  // được nữa (Khôi phục vô nghĩa), giữ khỏi làm rối bảng hàng ngày; vẫn có
  // thể bật lên để đối chiếu/audit.
  const [showPurged, setShowPurged] = useState(false);
  // Lọc theo nhãn độ tuổi để rà nhanh. "Chưa khoá" = admin chưa xác nhận nhãn
  // (khoá nhãn sau khi rà là cách đánh dấu "đã rà").
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("any");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showPurged && r.contentPurgedAt) return false;
      if (!matchesAgeFilter(r, ageFilter)) return false;
      if (!q) return true;
      return r.title.toLowerCase().includes(q) || r.authorUsername.toLowerCase().includes(q);
    });
  }, [rows, query, showPurged, ageFilter]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    if (pendingId) return null;
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/books/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && typeof data.error === "string" && data.error) || "Không cập nhật được.");
        return null;
      }
      // Route admin luôn trả is_exclusive + deleted_at với giá trị THẬT sau
      // khi ghi. Thông tin người xoá/lý do chỉ có ở nhánh xoá/khôi phục
      // (nhánh đổi độc quyền đi qua RPC, không trả removed_by_username) —
      // giữ nguyên giá trị cũ khi thiếu.
      const hasRemoval = "removed_by_username" in data;
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                isExclusive: data.is_exclusive,
                deletedAt: data.deleted_at,
                ...(hasRemoval && {
                  removedByUsername: data.removed_by_username,
                  removedReasonGroup: data.removed_reason_group,
                  removedReasonDetail: data.removed_reason_detail,
                }),
              }
            : r
        )
      );
      return data;
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
      return null;
    } finally {
      setPendingId(null);
    }
  };

  const confirmToggleExclusive = async (reason: string) => {
    if (!togglingBook) return;
    const data = await patch(togglingBook.id, { is_exclusive: !togglingBook.isExclusive, exclusiveReason: reason });
    if (data) setTogglingBook(null);
  };

  const confirmRemove = async (payload: RemoveChapterPayload) => {
    if (!removingBook) return;
    const data = await patch(removingBook.id, { deleted: true, ...payload });
    if (data) setRemovingBook(null);
  };

  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      {/* flex-wrap — trên điện thoại ô tìm (280px) + checkbox + bộ đếm không đủ một hàng. */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div className="flex items-center gap-2 rounded-lg border border-cream-border px-3 py-2">
          <MagnifyingGlassIcon size={15} color="var(--color-stone-alt)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên truyện hoặc tên tác giả…"
            className="w-[280px] bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          <Select
            label={null}
            aria-label="Lọc theo độ tuổi"
            size="sm"
            value={ageFilter}
            onChange={(e) => setAgeFilter(e.target.value as AgeFilter)}
            wrapperClassName="w-[190px]"
          >
            {AGE_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
          <Checkbox checked={showPurged} onChange={() => setShowPurged((v) => !v)}>
            Hiện cả truyện đã dọn nội dung (&gt;30 ngày)
          </Checkbox>
          <div className="text-xs text-stone-alt">
            {filtered.length}/{rows.length} truyện
            {truncated && ` (chỉ tải ${fetchLimit} truyện mới nhất — có thể còn truyện cũ hơn không hiện ở đây)`}
          </div>
        </div>
      </div>

      {error && <Alert tone="error" className="mb-3.5">{error}</Alert>}

      {/* overflow-x-auto — admin/layout.tsx bọc <main> bằng overflow-hidden
          (không cuộn được), nên bảng phải tự lo phần cuộn ngang CỦA CHÍNH
          NÓ khi đủ cột làm nó rộng hơn màn hình — thiếu dòng này, cột
          "Chương" (và cả Xoá/Khôi phục) sẽ bị cắt mất hẳn, không cách nào
          xem/bấm được, đúng như bug đã xảy ra khi thêm cột thứ 7. */}
      <div className="overflow-x-auto">
      <div className={`grid ${GRID_COLS} min-w-[1110px] gap-3 border-b border-cream-border px-2.5 pb-2.5 text-xs font-semibold text-stone-alt`}>
        <div>Truyện</div>
        <div>Tác giả</div>
        <div>Trạng thái</div>
        <div>Độc quyền</div>
        <div>Độ tuổi</div>
        <div>Đã xoá</div>
        <div />
        <div />
      </div>

      {filtered.map((r) => (
        <div
          key={r.id}
          className={`grid ${GRID_COLS} min-w-[1110px] items-center gap-3 border-b border-[#F1ECE0] px-2.5 py-[13px] text-sm font-medium text-[#3a352e]`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <span className="truncate">{r.title}</span>
            {r.published && !r.deletedAt && (
              <Link
                href={`/truyen/${r.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-stone-alt transition-colors hover:text-brand-ink"
              >
                <ArrowSquareOutIcon size={13} />
              </Link>
            )}
          </div>
          <div className="truncate text-stone-alt">@{r.authorUsername}</div>
          <div>
            <span
              className={`rounded-full px-[11px] py-1 text-[11px] font-semibold ${
                r.published ? "bg-success-form-border text-[#2C7453]" : "bg-cream-card-alt text-stone-dark"
              }`}
            >
              {r.published ? "Đã đăng" : "Bản nháp"}
            </span>
          </div>
          <div>
            <button
              type="button"
              disabled={pendingId === r.id}
              onClick={() => {
                setError(null);
                setTogglingBook(r);
              }}
              title={r.isExclusive ? "Bấm để bỏ độc quyền" : "Bấm để đặt độc quyền"}
              className={`rounded-full px-[11px] py-1 text-[11px] font-semibold transition-opacity disabled:opacity-50 ${
                r.isExclusive ? "bg-brand-ink text-white" : "border border-cream-border text-stone-dark"
              }`}
            >
              {r.isExclusive ? "Độc quyền" : "Tự do"}
            </button>
          </div>
          <div>
            <button
              type="button"
              onClick={() => setRatingBook(r)}
              title="Bấm để sửa nhãn độ tuổi"
              className={`inline-flex items-center gap-1 rounded-full px-[11px] py-1 text-[11px] font-semibold ${
                r.ageRating === "18"
                  ? "bg-error text-white"
                  : r.ageRating === "16"
                    ? "bg-cream-gold text-brand-gold-dark"
                    : "border border-cream-border text-stone-dark"
              }`}
            >
              {AGE_RATING_LABELS[r.ageRating]}
              {r.ageRatingLocked && <LockKeyIcon size={11} weight="bold" aria-label="Đã khoá" />}
            </button>
          </div>
          <div className="text-xs text-stone-alt">
            {r.deletedAt ? (
              <>
                {new Date(r.deletedAt).toLocaleDateString("vi-VN")}
                <div className="mt-0.5 truncate font-semibold text-stone-dark">
                  {r.removedByUsername ? `bởi @${r.removedByUsername}` : "Tác giả tự xoá"}
                </div>
                {r.removedReasonGroup && (
                  <RemovalReason group={r.removedReasonGroup} detail={r.removedReasonDetail} />
                )}
                {r.contentPurgedAt && (
                  <div className="mt-0.5 text-[10.5px] font-semibold text-error">Đã dọn nội dung</div>
                )}
              </>
            ) : (
              "—"
            )}
          </div>
          <div>
            <Link
              href={`/admin/noi-dung/${r.id}`}
              className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-ink"
            >
              <BookOpenTextIcon size={14} /> Chương
            </Link>
          </div>
          <div className="flex justify-end">
            {r.contentPurgedAt ? (
              <span className="text-[12.5px] font-medium text-stone-light" title="Nội dung đã bị rỗng hoá, không thể khôi phục.">
                Không thể khôi phục
              </span>
            ) : r.deletedAt ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                fullWidth={false}
                disabled={pendingId === r.id}
                onClick={() => patch(r.id, { deleted: false })}
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
                onClick={() => setRemovingBook(r)}
                className="gap-1.5"
              >
                <TrashIcon size={14} /> Xoá
              </Button>
            )}
          </div>
        </div>
      ))}
      </div>

      {filtered.length === 0 && (
        <div className="px-2.5 py-6 text-center text-sm text-stone-light">Không có truyện nào khớp.</div>
      )}

      {ratingBook && (
        <AgeRatingModal
          book={ratingBook}
          onCancel={() => setRatingBook(null)}
          onSaved={({ ageRating, locked }) => {
            setRows((prev) =>
              prev.map((row) => (row.id === ratingBook.id ? { ...row, ageRating, ageRatingLocked: locked } : row))
            );
            setRatingBook(null);
          }}
        />
      )}

      {togglingBook && (
        <ExclusivityModal
          book={togglingBook}
          pending={pendingId === togglingBook.id}
          error={error}
          onCancel={() => {
            setTogglingBook(null);
            setError(null);
          }}
          onConfirm={confirmToggleExclusive}
        />
      )}

      {removingBook && (
        <RemoveChapterModal
          heading={`Xoá truyện "${removingBook.title}"`}
          pending={pendingId === removingBook.id}
          onCancel={() => setRemovingBook(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  );
}

/** Lý do xoá — cắt 2 dòng trong ô; bản đầy đủ ở tooltip (title). */
function RemovalReason({ group, detail }: { group: string; detail: string | null }) {
  const text = `${reasonGroupLabel(group as ReasonGroupId)}${detail ? ` — ${detail}` : ""}`;
  return (
    <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug" title={text}>
      {text}
    </div>
  );
}
