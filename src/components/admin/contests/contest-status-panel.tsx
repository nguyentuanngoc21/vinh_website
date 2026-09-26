"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Button, Field, Modal } from "@/components/ui";
import { formatVnDateTime } from "@/lib/contests/datetime";
import { CONTEST_STATUS_LABEL, NEXT_CONTEST_STATUSES } from "@/lib/contests/labels";
import type { ContestStatus, Database } from "@/lib/supabase/types";

type ContestRow = Database["public"]["Tables"]["contests"]["Row"];
type StatusEvent = Database["public"]["Tables"]["contest_status_events"]["Row"];

/** Lưu ý riêng cho từng bước — hiện trong hộp xác nhận. */
const TRANSITION_NOTES: Partial<Record<ContestStatus, string>> = {
  announced: "Cuộc thi xuất hiện công khai. Từ lúc này thể lệ, đường dẫn, giải thưởng và điều kiện dự thi bị khoá vĩnh viễn.",
  submission_open: "Tác giả gửi được bài (trong khung giờ nhận bài). Người đã bật “Nhắc tôi khi mở” sẽ nhận thông báo.",
  submission_closed:
    "Chưa có bản chụp (snapshot) bản dự thi — tính năng ở Slice 1.6. Không dùng bước này cho cuộc thi thật cho đến khi Slice 1.6 xong (D3).",
  community_voting: "Mở bình chọn trong khung giờ đã đặt. Công thức chấm bị khoá từ lúc mở bình chọn.",
  results: "Công bố kết quả: giải thưởng và BXH Ban giám khảo/Chung cuộc hiện công khai. Hạn chế thu phí và khoá độc quyền được gỡ.",
  archived: "Lưu trữ vĩnh viễn — trang cuộc thi vẫn tồn tại ở mục Dấu ấn các mùa thi.",
};

export function ContestStatusPanel({ contest, events }: { contest: ContestRow; events: StatusEvent[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<ContestStatus | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = NEXT_CONTEST_STATUSES[contest.status];

  const confirm = async () => {
    if (!target) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/admin/contests/${contest.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: target, reason: reason.trim() || null }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(data?.error ?? "Không chuyển được trạng thái.");
      return;
    }
    setTarget(null);
    setReason("");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-alt">Trạng thái hiện tại</div>
        <div className="mt-1 text-xl font-bold text-brand-ink">{CONTEST_STATUS_LABEL[contest.status]}</div>
        <p className="mt-1 text-xs text-stone-alt">
          Chỉ đi tiến, không lùi. Cron hằng ngày tự mở/đóng nhận bài theo giờ; quyền của người dùng luôn kiểm cả thời gian thật.
        </p>

        {next.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {next.map((s) => (
              <Button key={s} type="button" variant={s === "submission_closed" ? "ghost" : "dark"} fullWidth={false}
                className="w-full px-5 py-2.5 text-sm sm:w-auto" onClick={() => { setTarget(s); setError(null); }}>
                Chuyển sang: {CONTEST_STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-alt">Cuộc thi đã lưu trữ — không còn bước tiếp theo.</p>
        )}
      </section>

      <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
        <h2 className="mb-3 text-base font-bold text-brand-ink">Lịch sử trạng thái</h2>
        {events.length === 0 ? (
          <p className="text-sm text-stone-alt">Chưa có thay đổi nào.</p>
        ) : (
          <ol className="flex flex-col border-l-2 border-cream-border pl-4">
            {events.map((e) => (
              <li key={e.id} className="relative pb-4 last:pb-0">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-gold" />
                <div className="text-xs font-semibold text-brand-gold-dark">{formatVnDateTime(e.created_at)}</div>
                <div className="text-sm text-ink">
                  {e.from_status ? `${CONTEST_STATUS_LABEL[e.from_status]} → ` : ""}
                  {CONTEST_STATUS_LABEL[e.to_status]}
                  <span className="text-stone-alt"> · {e.actor_id ? "quản trị viên" : "hệ thống"}</span>
                </div>
                {e.reason && <div className="text-xs text-stone-alt">{e.reason}</div>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <Modal open={target !== null} onClose={() => setTarget(null)} closeOnBackdrop={false} panelClassName="max-w-[480px] p-6">
        {target && (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-bold text-brand-ink">Chuyển sang “{CONTEST_STATUS_LABEL[target]}”?</h3>
            {TRANSITION_NOTES[target] && (
              <Alert tone={target === "submission_closed" ? "error" : "info"} icon={<WarningCircleIcon size={18} />}>
                {TRANSITION_NOTES[target]}
              </Alert>
            )}
            <Field label="Ghi chú (không bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" fullWidth={false} className="px-5 py-2.5 text-sm" onClick={() => setTarget(null)}>Huỷ</Button>
              <Button type="button" variant="dark" fullWidth={false} className="px-5 py-2.5 text-sm" disabled={pending} onClick={confirm}>
                {pending ? "Đang chuyển…" : "Xác nhận"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
