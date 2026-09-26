import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { listContestsForAdmin } from "@/lib/contests/admin-service";
import { formatVnDateTime } from "@/lib/contests/datetime";
import { CONTEST_STATUS_LABEL } from "@/lib/contests/labels";

export const metadata: Metadata = { title: "Cuộc thi · Vịnh Admin" };

/**
 * Danh sách cuộc thi (kể cả nháp) — requireAdmin() đã chạy ở
 * src/app/admin/layout.tsx. Service-role vì nháp không qua được RLS công khai.
 */
export default async function AdminContestsPage() {
  const contests = await listContestsForAdmin(createServiceRoleClient());

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-brand-ink">Cuộc thi</h1>
          <p className="mt-0.5 text-sm text-stone-alt">Tạo cuộc thi, chuyển giai đoạn, duyệt bài dự thi và trao giải.</p>
        </div>
        <Link href="/admin/cuoc-thi/moi"
          className="flex items-center justify-center gap-2 rounded-[10px] bg-brand-ink px-5 py-3 text-sm font-bold text-white hover:bg-brand-ink-dark">
          <PlusIcon size={16} weight="bold" /> Tạo cuộc thi
        </Link>
      </div>

      {contests.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-cream-border bg-white p-8 text-center text-sm text-stone-alt">
          Chưa có cuộc thi nào.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {contests.map((c) => (
            <Link key={c.id} href={`/admin/cuoc-thi/${c.id}`}
              className="flex flex-col gap-2 rounded-[12px] border border-cream-border bg-white px-4 py-3.5 transition-colors hover:border-brand-gold sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-semibold text-ink">{c.title}</span>
                  {c.is_featured && <span className="shrink-0 rounded-full bg-cream-card px-2 py-0.5 text-[11px] font-semibold text-brand-gold-dark">Nổi bật</span>}
                </div>
                <div className="text-xs text-stone-alt">
                  /cuoc-thi/{c.slug} · nhận bài {formatVnDateTime(c.submission_start)} – {formatVnDateTime(c.submission_end)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs">
                <span className="text-stone-alt">{c.entry_count} bài hợp lệ</span>
                <span className={`rounded-full px-2.5 py-1 font-semibold ${c.status === "draft" ? "bg-cream-card-alt text-stone-dark" : "bg-brand-ink text-white"}`}>
                  {CONTEST_STATUS_LABEL[c.status]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
