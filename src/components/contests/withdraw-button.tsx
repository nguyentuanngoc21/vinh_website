"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Modal } from "@/components/ui";

/** Rút bài dự thi — chỉ trước hạn (D6), xác nhận 2 bước (đặc tả UX mục 8). */
export function WithdrawButton({
  slug,
  submissionId,
  bookTitle,
  canResubmit,
}: {
  slug: string;
  submissionId: string;
  bookTitle: string;
  canResubmit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/contests/${slug}/submissions/${submissionId}/withdraw`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(data?.error ?? "Không rút được bài.");
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-semibold text-error">Rút bài</button>
      <Modal open={open} onClose={() => setOpen(false)} closeOnBackdrop={false} panelClassName="max-w-[440px] p-6">
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-bold text-brand-ink">Rút “{bookTitle}” khỏi cuộc thi?</h3>
          <p className="text-sm leading-relaxed text-slate">
            Tác phẩm rời khỏi danh sách dự thi ngay. {canResubmit ? "Cuộc thi cho phép gửi lại trước hạn nhận bài." : "Cuộc thi này không cho gửi lại sau khi rút."}
          </p>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" fullWidth={false} className="px-5 py-2.5 text-sm" onClick={() => setOpen(false)}>Giữ bài</Button>
            <Button type="button" variant="dark" fullWidth={false} className="px-5 py-2.5 text-sm" disabled={pending} onClick={confirm}>
              {pending ? "Đang rút…" : "Xác nhận rút bài"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
