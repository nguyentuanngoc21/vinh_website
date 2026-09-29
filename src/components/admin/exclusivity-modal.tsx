"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Modal, Textarea } from "@/components/ui";

type ExclusivityEvent = {
  id: string;
  fromExclusive: boolean | null;
  toExclusive: boolean;
  actorKind: "author" | "admin" | "system";
  actorUsername: string | null;
  reason: string | null;
  createdAt: string;
};

const ACTOR_LABEL: Record<ExclusivityEvent["actorKind"], string> = {
  author: "Tác giả",
  admin: "Admin",
  system: "Hệ thống",
};

const stateLabel = (exclusive: boolean) => (exclusive ? "Độc quyền" : "Tự do");

/**
 * Admin/super_admin đổi Độc quyền <-> Tự do cho 1 truyện: bắt buộc lý do,
 * kèm lịch sử đổi trước đó (book_exclusivity_events). Bỏ qua khoá 3 ngày của
 * tác giả; chỉ cuộc thi yêu cầu độc quyền (D11) còn chặn.
 */
export function ExclusivityModal({
  book,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  book: { id: string; title: string; isExclusive: boolean };
  pending: boolean;
  /** Lỗi từ PATCH (vd truyện đang dự thi yêu cầu độc quyền). */
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [events, setEvents] = useState<ExclusivityEvent[] | null>(null);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/books/${book.id}/exclusivity-events`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { events: ExclusivityEvent[] }) => {
        if (!cancelled) setEvents(data.events);
      })
      .catch(() => {
        if (!cancelled) setHistoryError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  const trimmed = reason.trim();

  return (
    <Modal open onClose={onCancel} closeOnBackdrop={false} panelClassName="max-w-[480px] p-6">
      <h2 className="text-lg font-bold text-brand-ink">
        {book.isExclusive ? "Bỏ độc quyền" : "Đặt độc quyền"} cho &quot;{book.title}&quot;?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-alt">
        {book.isExclusive
          ? "Truyện sẽ chuyển sang Tự do: mất tag \"Độc quyền\" trên trang công khai và tác giả được phát hành ở nền tảng khác. Thao tác này bỏ qua khoá 3 ngày của tác giả."
          : "Truyện sẽ được gắn tag \"Độc quyền\" trên trang công khai. Chỉ nên đặt khi tác giả đã đồng ý Hợp đồng khai thác độc quyền."}
      </p>

      <Textarea
        label="Lý do (bắt buộc, lưu vào lịch sử)"
        size="sm"
        rows={3}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ví dụ: Tác giả không chọn độc quyền, bị gán nhầm khi nhập bản thảo."
        wrapperClassName="mt-4"
      />

      <div className="mt-4">
        <div className="mb-1.5 text-[13px] font-semibold text-slate">Lịch sử</div>
        {historyError ? (
          <Alert tone="error">Không tải được lịch sử.</Alert>
        ) : events === null ? (
          <div className="text-xs text-stone-alt">Đang tải…</div>
        ) : events.length === 0 ? (
          <div className="text-xs text-stone-alt">Chưa có lịch sử (các lần đổi trước 30/09/2026 không được ghi lại).</div>
        ) : (
          <ul className="max-h-[180px] space-y-2 overflow-y-auto pr-1">
            {events.map((e) => (
              <li key={e.id} className="rounded-lg bg-cream-card px-3 py-2 text-xs text-stone-dark">
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <span className="font-semibold">
                    {e.fromExclusive === null
                      ? `Tạo truyện: ${stateLabel(e.toExclusive)}`
                      : `${stateLabel(e.fromExclusive)} → ${stateLabel(e.toExclusive)}`}
                  </span>
                  <span className="text-stone-alt">{new Date(e.createdAt).toLocaleString("vi-VN")}</span>
                </div>
                <div className="mt-0.5 text-stone-alt">
                  {ACTOR_LABEL[e.actorKind]}
                  {e.actorUsername && ` @${e.actorUsername}`}
                  {e.reason && ` — ${e.reason}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" fullWidth={false} onClick={onCancel}>
          Huỷ
        </Button>
        <Button
          type="button"
          variant="dark"
          size="sm"
          fullWidth={false}
          disabled={pending || !trimmed}
          onClick={() => onConfirm(trimmed)}
        >
          {book.isExclusive ? "Chuyển sang Tự do" : "Đặt Độc quyền"}
        </Button>
      </div>
    </Modal>
  );
}
