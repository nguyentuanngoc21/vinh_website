"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowSquareOutIcon, MagnifyingGlassIcon, TrashIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";

export type ContentBookRow = {
  id: string;
  title: string;
  slug: string;
  authorUsername: string;
  published: boolean;
  isExclusive: boolean;
  deletedAt: string | null;
};

const GRID_COLS = "grid-cols-[1fr_160px_110px_130px_150px_190px]";

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.title.toLowerCase().includes(q) || r.authorUsername.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const patch = async (id: string, body: Record<string, boolean>) => {
    if (pendingId) return;
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
        return;
      }
      // Route admin luôn select("... is_exclusive, deleted_at") nên data
      // luôn có 2 field này với giá trị THẬT sau khi ghi — không cần
      // check field nào có mặt, chỉ cần gán lại từ response.
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, isExclusive: data.is_exclusive, deletedAt: data.deleted_at } : r
        )
      );
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      <div className="mb-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 rounded-lg border border-cream-border px-3 py-2">
          <MagnifyingGlassIcon size={15} color="var(--color-stone-alt)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên truyện hoặc tên tác giả…"
            className="w-[280px] bg-transparent text-sm outline-none"
          />
        </div>
        <div className="text-xs text-stone-alt">
          {filtered.length}/{rows.length} truyện
          {truncated && ` (chỉ tải ${fetchLimit} truyện mới nhất — có thể còn truyện cũ hơn không hiện ở đây)`}
        </div>
      </div>

      {error && (
        <div className="mb-3.5 rounded-lg border border-[#f3c6c6] bg-[#fdf1f1] px-3 py-2.5 text-[12.5px] font-medium text-[#B02A37]">
          {error}
        </div>
      )}

      <div className={`grid ${GRID_COLS} gap-3 border-b border-cream-border px-2.5 pb-2.5 text-xs font-semibold text-stone-alt`}>
        <div>Truyện</div>
        <div>Tác giả</div>
        <div>Trạng thái</div>
        <div>Độc quyền</div>
        <div>Đã xoá</div>
        <div />
      </div>

      {filtered.map((r) => (
        <div
          key={r.id}
          className={`grid ${GRID_COLS} items-center gap-3 border-b border-[#F1ECE0] px-2.5 py-[13px] text-sm font-medium text-[#3a352e]`}
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
                r.published ? "bg-[#DBF3E8] text-[#2C7453]" : "bg-cream-card-alt text-stone-dark"
              }`}
            >
              {r.published ? "Đã đăng" : "Bản nháp"}
            </span>
          </div>
          <div>
            <button
              type="button"
              disabled={pendingId === r.id}
              onClick={() => patch(r.id, { is_exclusive: !r.isExclusive })}
              className={`rounded-full px-[11px] py-1 text-[11px] font-semibold transition-opacity disabled:opacity-50 ${
                r.isExclusive ? "bg-brand-ink text-white" : "border border-cream-border text-stone-dark"
              }`}
            >
              {r.isExclusive ? "Độc quyền" : "Tự do"}
            </button>
          </div>
          <div className="text-xs text-stone-alt">
            {r.deletedAt ? new Date(r.deletedAt).toLocaleDateString("vi-VN") : "—"}
          </div>
          <div className="flex justify-end">
            {r.deletedAt ? (
              <button
                type="button"
                disabled={pendingId === r.id}
                onClick={() => patch(r.id, { deleted: false })}
                className="flex items-center gap-1.5 rounded-lg border border-cream-border px-3 py-1.5 text-[12.5px] font-semibold text-brand-ink disabled:opacity-50"
              >
                <ArrowCounterClockwiseIcon size={14} /> Khôi phục
              </button>
            ) : (
              <button
                type="button"
                disabled={pendingId === r.id}
                onClick={() => patch(r.id, { deleted: true })}
                className="flex items-center gap-1.5 rounded-lg border border-[#f3c6c6] px-3 py-1.5 text-[12.5px] font-semibold text-[#B02A37] disabled:opacity-50"
              >
                <TrashIcon size={14} /> Xoá
              </button>
            )}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="px-2.5 py-6 text-center text-sm text-stone-light">Không có truyện nào khớp.</div>
      )}
    </div>
  );
}
