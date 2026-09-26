"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, useToast } from "@/components/ui";
import { EligibilityChecklist } from "@/components/contests/eligibility-checklist";
import type { BookEligibility } from "@/lib/contests/submission-service";

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
  const book = books.find((b) => b.bookId === selected) ?? null;

  const sorted = [...books].sort((a, b) => Number(b.result.eligible) - Number(a.result.eligible));

  const submit = async () => {
    if (!book || !agree) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/contests/${slug}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: book.bookId, acceptedRulesVersion: rulesVersion }),
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
        <Link href="/author/new" className="rounded-full bg-brand-gold px-5 py-2.5 text-sm font-semibold text-brand-ink no-underline">Tạo tác phẩm mới</Link>
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
            return (
              <button key={b.bookId} type="button" onClick={() => { setSelected(b.bookId); setAgree(false); setError(null); setStep(2); }}
                className={`flex items-center gap-3 rounded-[14px] border p-4 text-left transition-colors ${
                  selected === b.bookId ? "border-brand-ink bg-white" : "border-border-light bg-white hover:border-brand-gold"
                }`}>
                <span className={`h-[18px] w-[18px] shrink-0 rounded-full border-2 ${selected === b.bookId ? "border-[5px] border-brand-ink" : "border-border-light"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{b.title}</span>
                  <span className={`mt-0.5 block text-xs ${b.result.eligible ? "text-success-form" : "text-stone-alt"}`}>
                    {b.result.eligible ? "Đủ điều kiện" : `Chưa đủ điều kiện · ${failed[0]?.message ?? ""}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === 2 && book && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1 rounded-[14px] border border-border-light bg-white p-4">
            <div className="text-xs text-stone-alt">Tác phẩm</div>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-base font-bold text-ink">{book.title}</span>
              {books.length > 1 && (
                <button type="button" onClick={() => setStep(1)} className="shrink-0 text-[13px] font-semibold text-brand-gold-dark">Đổi truyện</button>
              )}
            </div>
            <div className="text-[13px] text-stone-alt">Hạn gửi & chỉnh sửa: <b className="text-ink">{deadlineText}</b></div>
          </div>

          <section>
            <h2 className="mb-2.5 text-sm font-semibold text-ink">Kiểm tra điều kiện</h2>
            <EligibilityChecklist checks={book.result.checks} />
          </section>

          {!book.result.eligible ? (
            <Alert tone="error">Tác phẩm chưa đủ điều kiện. Sửa các mục đánh dấu đỏ rồi quay lại — hoặc chọn một tác phẩm khác.</Alert>
          ) : (
            <>
              <Alert tone="info">
                Truyện dự thi phải miễn phí toàn bộ chương (cả giá đọc và giá audio) cho mọi người đọc đến khi công bố kết quả.
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
            <Button type="button" fullWidth={false} className="px-7" disabled={!book.result.eligible || !agree || pending} onClick={submit}>
              {pending ? "Đang gửi…" : "Gửi bài dự thi"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
