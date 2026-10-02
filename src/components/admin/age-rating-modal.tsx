"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Modal, Textarea } from "@/components/ui";
import { AgeRatingPicker } from "@/components/author/age-rating-picker";
import { AGE_RATING_LABELS, contentWarningLabel, type AgeRating } from "@/lib/age-rating";

type AgeRatingEvent = {
  id: string;
  fromRating: AgeRating | null;
  toRating: AgeRating;
  fromWarnings: string[] | null;
  toWarnings: string[];
  locked: boolean;
  actorKind: "author" | "admin" | "system";
  actorUsername: string | null;
  reason: string | null;
  createdAt: string;
};

type Loaded = {
  ageRating: AgeRating;
  contentWarnings: string[];
  lockedAt: string | null;
  lockedByUsername: string | null;
  events: AgeRatingEvent[];
};

const ACTOR_LABEL: Record<AgeRatingEvent["actorKind"], string> = {
  author: "Tác giả",
  admin: "Admin",
  system: "Hệ thống",
};

const warningsText = (ids: string[]) => (ids.length ? ids.map(contentWarningLabel).join(", ") : "không có cảnh báo");

/**
 * Admin/super_admin sửa nhãn độ tuổi + cảnh báo của 1 truyện: bắt buộc lý
 * do, mặc định khoá nhãn (tác giả không tự hạ được). Kèm lịch sử ai đã đổi,
 * khi nào, vì sao (book_age_rating_events).
 */
export function AgeRatingModal({
  book,
  onCancel,
  onSaved,
}: {
  book: { id: string; title: string };
  onCancel: () => void;
  onSaved: (result: { ageRating: AgeRating; locked: boolean }) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [rating, setRating] = useState<AgeRating>("all");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lock, setLock] = useState(true);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/books/${book.id}/age-rating`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: Loaded) => {
        if (cancelled) return;
        setLoaded(data);
        setRating(data.ageRating);
        setWarnings(data.contentWarnings);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  const trimmed = reason.trim();

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/books/${book.id}/age-rating`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageRating: rating, contentWarnings: warnings, reason: trimmed, lock }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Không lưu được nhãn độ tuổi.");
        return;
      }
      onSaved({ ageRating: data.ageRating, locked: data.locked });
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onClose={onCancel} closeOnBackdrop={false} panelClassName="max-w-[520px] p-6">
      <h2 className="text-lg font-bold text-brand-ink">Nhãn độ tuổi — &quot;{book.title}&quot;</h2>

      {loadError ? (
        <Alert tone="error" className="mt-4">Không tải được nhãn độ tuổi.</Alert>
      ) : loaded === null ? (
        <div className="mt-4 text-sm text-stone-alt">Đang tải…</div>
      ) : (
        <div className="mt-3 max-h-[62vh] overflow-y-auto pr-1">
          {loaded.lockedAt && (
            <p className="mb-3 text-[12.5px] text-stone-alt">
              Đang khoá từ {new Date(loaded.lockedAt).toLocaleString("vi-VN")}
              {loaded.lockedByUsername && ` bởi @${loaded.lockedByUsername}`}.
            </p>
          )}

          <AgeRatingPicker
            rating={rating}
            warnings={warnings}
            onChange={(r, w) => {
              setRating(r);
              setWarnings(w);
            }}
          />

          <div className="mt-4">
            <Checkbox checked={lock} onChange={() => setLock((v) => !v)}>
              Khoá nhãn — tác giả không tự sửa được (bỏ chọn để mở khoá)
            </Checkbox>
          </div>

          <Textarea
            label="Lý do (bắt buộc, lưu vào lịch sử)"
            size="sm"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: Báo cáo #… — chương 12 có cảnh tình dục rõ ràng, nâng lên 18+."
            wrapperClassName="mt-4"
          />

          <div className="mt-4">
            <div className="mb-1.5 text-[13px] font-semibold text-slate">Lịch sử</div>
            {loaded.events.length === 0 ? (
              <div className="text-xs text-stone-alt">Chưa có lịch sử.</div>
            ) : (
              <ul className="space-y-2">
                {loaded.events.map((e) => (
                  <li key={e.id} className="rounded-lg bg-cream-card px-3 py-2 text-xs text-stone-dark">
                    <div className="flex flex-wrap items-center justify-between gap-x-2">
                      <span className="font-semibold">
                        {e.fromRating === null
                          ? `Ban đầu: ${AGE_RATING_LABELS[e.toRating]}`
                          : `${AGE_RATING_LABELS[e.fromRating]} → ${AGE_RATING_LABELS[e.toRating]}`}
                        {e.locked && " · khoá"}
                      </span>
                      <span className="text-stone-alt">{new Date(e.createdAt).toLocaleString("vi-VN")}</span>
                    </div>
                    <div className="mt-0.5 text-stone-alt">Cảnh báo: {warningsText(e.toWarnings)}</div>
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
        </div>
      )}

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
          disabled={pending || !trimmed || loaded === null}
          onClick={save}
        >
          {pending ? "Đang lưu…" : "Lưu nhãn"}
        </Button>
      </div>
    </Modal>
  );
}
