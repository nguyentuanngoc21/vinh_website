"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Textarea } from "@/components/ui";
import { AgeRatingModal } from "@/components/admin/age-rating-modal";
import { REPORT_REASONS, type ContentReport } from "@/lib/moderation/content-reports";

const STATUS: Record<ContentReport["status"], string> = {
  pending: "Chờ xem xét",
  reviewing: "Đang xem xét",
  resolved: "Đã xử lý",
  dismissed: "Không đủ căn cứ",
};

const STATUS_CLASS: Record<ContentReport["status"], string> = {
  pending: "bg-error-bg text-error",
  reviewing: "bg-cream-gold text-brand-gold-dark",
  resolved: "bg-success-form-border text-success",
  dismissed: "bg-cream-card-alt text-stone-dark",
};

export function ContentReportsTable({
  rows,
  page,
  hasMore,
  reviewerUsernames,
}: {
  rows: ContentReport[];
  page: number;
  hasMore: boolean;
  /** reviewed_by → username, để hiện ai đã xử lý. */
  reviewerUsernames: Record<string, string>;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-stone-alt">
        Báo cáo cần được xác minh trước khi xử lý nội dung. Dùng trang quản lý tác phẩm để gỡ tác phẩm/chương khi cần.
      </p>
      {!rows.length && <p className="text-sm text-stone-light">Chưa có báo cáo.</p>}
      {rows.map((row) => (
        <ReportRow key={row.id} row={row} reviewerUsername={row.reviewed_by ? reviewerUsernames[row.reviewed_by] : undefined} />
      ))}
      <div className="flex gap-4 text-sm font-semibold text-brand-ink">
        {page > 1 && <Link href={`?page=${page - 1}`}>Trang trước</Link>}
        {hasMore && <Link href={`?page=${page + 1}`}>Trang sau</Link>}
      </div>
    </div>
  );
}

function ReportRow({ row, reviewerUsername }: { row: ContentReport; reviewerUsername?: string }) {
  const router = useRouter();
  const [note, setNote] = useState(row.resolution_note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingSaved, setRatingSaved] = useState(false);

  async function update(status: string) {
    setPending(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/content-reports/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Không thể cập nhật.");
      else router.refresh();
    } catch {
      setError("Không thể kết nối máy chủ.");
    } finally {
      setPending(false);
    }
  }

  const closed = row.status === "resolved" || row.status === "dismissed";
  return (
    <article className="grid gap-3 rounded-xl border border-cream-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 break-words font-semibold text-brand-ink">
          {row.book_title}
          {row.chapter_title && ` · ${row.chapter_title}`}
        </h2>
        <span className={`shrink-0 rounded-full px-[11px] py-1 text-[11px] font-semibold ${STATUS_CLASS[row.status]}`}>
          {STATUS[row.status]}
        </span>
      </div>
      <p className="text-sm text-stone-alt">
        {REPORT_REASONS[row.reason]} · {new Date(row.created_at).toLocaleString("vi-VN")}
      </p>
      <p className="whitespace-pre-wrap break-words text-sm text-ink">{row.description}</p>
      {row.evidence_url && (
        <a href={row.evidence_url} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-brand-gold-dark underline">
          Nguồn đối chiếu: {row.evidence_url}
        </a>
      )}
      <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-brand-ink">
        <Link className="underline" href={row.chapter_id ? `/read/${row.book_id}/${row.chapter_id}` : `/truyen/${row.book_id}`}>
          Xem nội dung
        </Link>
        <Link className="underline" href={`/admin/noi-dung/${row.book_id}`}>
          Quản lý tác phẩm/chương
        </Link>
        {/* Sửa nhãn độ tuổi ngay tại báo cáo (sai nhãn, nội dung phản cảm…), không phải đi tìm truyện ở /admin/noi-dung. */}
        <button type="button" onClick={() => setRatingOpen(true)} className="cursor-pointer underline">
          {ratingSaved ? "Đã cập nhật nhãn độ tuổi" : "Sửa nhãn độ tuổi"}
        </button>
      </div>
      {closed ? (
        <p className="whitespace-pre-wrap text-sm text-slate">
          Kết quả: {row.resolution_note}
          <span className="block text-xs text-stone-alt">
            {reviewerUsername ? `@${reviewerUsername}` : "Admin"} · {new Date(row.updated_at).toLocaleString("vi-VN")}
          </span>
        </p>
      ) : (
        <>
          <Textarea
            label="Ghi chú / kết quả xử lý"
            size="sm"
            rows={3}
            maxLength={3000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {(["reviewing", "resolved", "dismissed"] as const).map((status) => (
              <Button
                key={status}
                type="button"
                variant={status === "resolved" ? "dark" : "ghost"}
                size="sm"
                fullWidth={false}
                disabled={pending}
                onClick={() => update(status)}
              >
                {STATUS[status]}
              </Button>
            ))}
          </div>
        </>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {ratingOpen && (
        <AgeRatingModal
          book={{ id: row.book_id, title: row.book_title }}
          onCancel={() => setRatingOpen(false)}
          onSaved={() => {
            setRatingOpen(false);
            setRatingSaved(true);
          }}
        />
      )}
    </article>
  );
}
