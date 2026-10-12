"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, useToast } from "@/components/ui";
import { EligibilityChecklist } from "@/components/contests/eligibility-checklist";
import type { BookEligibility } from "@/lib/contests/submission-service";
import type { EligibilityResult } from "@/lib/contests/eligibility/types";

/**
 * SubmitEntryModal dạng trang (mobile: full-screen 2 bước — chọn truyện →
 * điều kiện & đồng ý thể lệ). Dùng chung cho cả 2 điểm vào: microsite
 * ("Gửi tác phẩm dự thi") và trang truyện của tác giả (?book= chọn sẵn).
 * Gọi POST /api/contests/:slug/submissions — server kiểm lại toàn bộ.
 */
export function SubmitEntryFlow({
  slug,
  contestTitle,
  deadlineText,
  rulesVersion,
  books,
  preselectBookId,
  requireExclusive,
}: {
  slug: string;
  contestTitle: string;
  deadlineText: string;
  rulesVersion: string;
  books: BookEligibility[];
  preselectBookId: string | null;
  requireExclusive: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const initial = books.find((b) => b.bookId === preselectBookId) ?? null;
  const [selected, setSelected] = useState<string | null>(initial?.bookId ?? null);
  const [step, setStep] = useState<1 | 2>(initial ? 2 : 1);
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chapterMode, setChapterMode] = useState(false);
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [chapterResult, setChapterResult] = useState<EligibilityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const book = books.find((b) => b.bookId === selected) ?? null;
  const result = chapterMode ? chapterResult : book?.result;

  const resetSelection = () => { setChapterMode(false); setChapterIds([]); setChapterResult(null); setAgree(false); setError(null); };
  const checkChapters = async () => {
    if (!book) return;
    setChecking(true); setError(null);
    try {
      const query = new URLSearchParams({ bookId: book.bookId, chapterIds: chapterIds.join(",") });
      const res = await fetch(`/api/contests/${slug}/eligibility?${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không kiểm tra được điều kiện.");
      setChapterResult(data.books[0]?.result ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "Không kiểm tra được điều kiện."); }
    finally { setChecking(false); }
  };

  const sorted = [...books].sort((a, b) => Number(b.result.eligible) - Number(a.result.eligible));

  const submit = async () => {
    if (!book || !agree || !result?.eligible) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/contests/${slug}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: book.bookId, acceptedRulesVersion: rulesVersion, ...(chapterMode ? { chapterIds } : {}) }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      // Giữ nguyên bước và checkbox, báo lỗi ngay trên nút (đặc tả UX mục 7, "Error").
      setError(data?.error ?? "Không gửi được. Vui lòng thử lại.");
      return;
    }
    toast.show(`Đã gửi dự thi ${contestTitle}. Tác phẩm xuất hiện ở “Mới tham gia”.`, "success");
    router.push(`/author/${book.bookId}`);
    router.refresh();
  };

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-light p-10 text-center">
        <div className="text-lg font-bold text-ink">Bạn chưa có tác phẩm nào</div>
        <p className="max-w-[420px] text-sm text-stone-alt">Tạo và xuất bản một truyện trong trình soạn thảo, rồi quay lại để gửi dự thi.</p>
        <Link href="/author/new" className="rounded-full bg-brand-gold px-5 py-2.5 text-sm font-semibold text-brand-navy no-underline">Tạo tác phẩm mới</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-stone-alt">
        <span className={step === 1 ? "text-brand-ink" : ""}>1. Chọn tác phẩm</span>
        <span>›</span>
        <span className={step === 2 ? "text-brand-ink" : ""}>2. Điều kiện & thể lệ</span>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-2.5">
          {sorted.map((b) => {
            const failed = b.result.checks.filter((c) => !c.passed && c.blocking);
            // Truyện đang dự thi cuộc thi này: ghi rõ, không gọi là "chưa đủ điều kiện".
            const entered = failed.length === 1 && failed[0].code === "not_already_entered" && failed[0].details?.status !== undefined;
            return (
              <button key={b.bookId} type="button" onClick={() => { setSelected(b.bookId); resetSelection(); setStep(2); }}
                className={`flex items-center gap-3 rounded-[14px] border p-4 text-left transition-colors ${
                  selected === b.bookId ? "border-brand-ink bg-surface" : "border-border-light bg-surface hover:border-brand-gold"
                }`}>
                <span className={`h-[18px] w-[18px] shrink-0 rounded-full border-2 ${selected === b.bookId ? "border-[5px] border-brand-ink" : "border-border-light"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{b.title}</span>
                  <span className={`mt-0.5 block text-xs ${b.result.eligible ? "text-success-form" : "text-stone-alt"}`}>
                    {b.result.eligible ? "Toàn bộ truyện đủ điều kiện" : entered ? "Đã gửi vào cuộc thi này" : `Toàn bộ truyện chưa đủ điều kiện · ${failed[0]?.message ?? ""}. Có thể kiểm tra từng chương ở bước tiếp theo.`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === 2 && book && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1 rounded-[14px] border border-border-light bg-surface p-4">
            <div className="text-xs text-stone-alt">Tác phẩm</div>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-base font-bold text-ink">{book.title}</span>
              {books.length > 1 && (
                <button type="button" disabled={checking || pending} onClick={() => { resetSelection(); setStep(1); }} className="shrink-0 text-[13px] font-semibold text-brand-gold-dark">Đổi truyện</button>
              )}
            </div>
            <div className="text-[13px] text-stone-alt">Hạn gửi & chỉnh sửa: <b className="text-ink">{deadlineText}</b></div>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-ink">Phạm vi dự thi</h2>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="entry-scope" checked={!chapterMode} disabled={checking || pending} onChange={() => { resetSelection(); }} />Toàn bộ truyện</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="entry-scope" checked={chapterMode} disabled={checking || pending} onChange={() => { setChapterMode(true); setAgree(false); setChapterResult(null); }} />Chọn chương của truyện đang viết</label>
            {chapterMode && <>
              <p className="text-sm text-stone-alt">Chỉ chọn chương được tạo và xuất bản trong thời gian mở nhận bài. Số chữ và chấm điểm chỉ tính các chương đã chọn. Danh sách được chốt khi gửi bài.</p>
              <div className="max-h-80 overflow-y-auto rounded-xl border border-border-light p-3">
                {(book.chapters ?? []).map((ch) => <label key={ch.id} className="flex items-start gap-2 py-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={chapterIds.includes(ch.id)} disabled={checking || pending || !ch.eligible_for_contest}
                    onChange={() => { setChapterIds((ids) => ids.includes(ch.id) ? ids.filter((id) => id !== ch.id) : [...ids, ch.id]); setChapterResult(null); setAgree(false); }} />
                  <span>{ch.title}<span className="block text-xs text-stone-alt">{ch.word_count.toLocaleString("vi-VN")} chữ · {ch.eligible_for_contest ? "Trong thời gian nhận bài" : !ch.published ? "Bản nháp — cần xuất bản trước khi chọn" : ch.removed_at ? "Chương đã bị gỡ" : "Ngày tạo hoặc xuất bản ngoài thời gian nhận bài"}</span></span>
                </label>)}
                {!book.chapters?.length && <p className="text-sm text-stone-alt">Truyện chưa có chương.</p>}
              </div>
              <Button type="button" disabled={checking || pending || chapterIds.length === 0} onClick={checkChapters}>{checking ? "Đang kiểm tra…" : `Kiểm tra ${chapterIds.length} chương đã chọn`}</Button>
            </>}
          </section>

          <section>
            <h2 className="mb-2.5 text-sm font-semibold text-ink">Kiểm tra điều kiện</h2>
            {result ? <EligibilityChecklist checks={result.checks} /> : <p className="text-sm text-stone-alt">Chọn chương rồi kiểm tra điều kiện trước khi gửi bài.</p>}
          </section>

          {!result?.eligible ? (
            <Alert tone="error">Tác phẩm chưa đủ điều kiện. Sửa các mục đánh dấu đỏ rồi quay lại — hoặc chọn một tác phẩm khác.</Alert>
          ) : (
            <>
              <Alert tone="info">
                {chapterMode ? "Các chương được chọn dự thi phải miễn phí (cả giá đọc và giá audio) đến khi công bố kết quả." : "Truyện dự thi phải miễn phí toàn bộ chương (cả giá đọc và giá audio) cho mọi người đọc đến khi công bố kết quả."}
                {requireExclusive && " Cuộc thi yêu cầu Độc quyền trên Vịnh — bạn sẽ không tắt được độc quyền cho đến khi công bố kết quả."}
                {" "}Bạn vẫn sửa truyện được; chỉ bản tại thời điểm đóng nhận bài được chấm.
              </Alert>
              <Checkbox checked={agree} onChange={() => setAgree((v) => !v)}>
                Tôi đã đọc và đồng ý <Link href={`/cuoc-thi/${slug}?tab=the-le`} target="_blank" className="font-semibold text-brand-gold-dark">thể lệ cuộc thi</Link>{" "}
                (phiên bản {rulesVersion}). Tôi xác nhận đây là tác phẩm gốc của tôi.
              </Checkbox>
            </>
          )}

          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex flex-col-reverse gap-2.5 border-t border-border-light pt-4 sm:flex-row sm:justify-end">
            <Link href={`/cuoc-thi/${slug}`} className="flex items-center justify-center rounded-[10px] border border-border-light px-6 py-3 text-sm font-semibold text-ink no-underline">Huỷ</Link>
            <Button type="button" fullWidth={false} className="px-7" disabled={!result?.eligible || !agree || pending || checking} onClick={submit}>
              {pending ? "Đang gửi…" : "Gửi bài dự thi"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
