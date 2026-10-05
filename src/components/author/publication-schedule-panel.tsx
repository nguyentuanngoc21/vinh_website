"use client";

import { useEffect, useState } from "react";
import { Button, Field } from "@/components/ui";
import { vietnamScheduleTime } from "@/lib/authoring/publication-schedule";
import type { Database } from "@/lib/supabase/types";

type Schedule = Database["public"]["Tables"]["chapter_publication_schedules"]["Row"];
type Pending = { id: string; chapterIds: string[]; startsAt: string; intervalDays: 0 | 1; price?: number };
const formatter = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });
const statuses = { pending: "Đang chờ", completed: "Đã hoàn tất", cancelled: "Đã huỷ", failed: "Cần xử lý" };

export function PublicationSchedulePanel({ bookId, chapterIds, price, disabled, onMissingAgreements }: {
  bookId: string; chapterIds: string[]; price?: number; disabled: boolean;
  onMissingAgreements: (ids: string[]) => void;
}) {
  const [startsAt, setStartsAt] = useState("");
  const [daily, setDaily] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [message, setMessage] = useState("");
  const url = `/api/authoring/books/${bookId}/schedules`;

  useEffect(() => {
    let cancelled = false;
    fetch(url).then(async (res) => {
      const data = await res.json();
      if (cancelled) return;
      if (res.ok) setSchedules(data.schedules ?? []);
      else setMessage(data.error || "Không tải được lịch đăng.");
    }).catch(() => { if (!cancelled) setMessage("Không kết nối được để tải lịch đăng."); });
    return () => { cancelled = true; };
  }, [url]);

  async function reload() {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không tải được lịch đăng.");
    setSchedules(data.schedules ?? []);
  }

  async function save() {
    if (busy || disabled) return;
    let request = pending;
    if (!request) {
      const iso = vietnamScheduleTime(startsAt);
      if (!iso || Date.parse(iso) <= Date.now()) { setMessage("Chọn thời điểm trong tương lai theo giờ Việt Nam."); return; }
      request = { id: crypto.randomUUID(), chapterIds: [...chapterIds], startsAt: iso, intervalDays: daily ? 1 : 0, ...(price !== undefined ? { price } : {}) };
      setPending(request);
    }
    setBusy(true); setMessage("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (Array.isArray(data?.missingAgreementIds)) onMissingAgreements(data.missingAgreementIds);
        if (res.status === 400 || res.status === 409 || res.status === 404) setPending(null);
        setMessage(data?.error || "Không lưu được lịch. Bấm thử lại."); return;
      }
      setPending(null);
      setMessage("Đã lưu lịch đăng. Nội dung sẽ được kiểm tra lại khi đến giờ.");
      await reload();
    } catch {
      setMessage("Mất kết nối. Tải lại danh sách hoặc thử lại cùng lượt hẹn giờ để tránh tạo trùng lịch.");
    } finally { setBusy(false); }
  }

  async function cancel(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(url, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json().catch(() => null);
      setMessage(res.ok ? "Đã huỷ các lượt đăng còn lại trong lịch này." : data?.error || "Không huỷ được lịch.");
      await reload();
    } catch { setMessage("Mất kết nối. Tải lại danh sách để kiểm tra trạng thái lịch."); }
    finally { setBusy(false); }
  }

  return <div className="mb-4 space-y-3 rounded-xl border border-cream-border bg-surface p-4">
    <div className="text-sm font-semibold text-brand-ink">Hẹn giờ đăng</div>
    <p className="text-xs text-stone-alt">Áp dụng cho chương và giá đã chọn ở trên. Thời gian theo Việt Nam (UTC+7); thứ tự theo danh sách chương.</p>
    <Field label="Thời điểm bắt đầu (giờ Việt Nam)" type="datetime-local" value={startsAt}
      disabled={busy || !!pending || disabled} onChange={(e) => setStartsAt(e.target.value)} />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={daily}
      disabled={busy || !!pending || disabled} onChange={(e) => setDaily(e.target.checked)} />Mỗi ngày đăng một chương vào giờ đã chọn</label>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" fullWidth={false} onClick={save}
        disabled={busy || disabled || (!pending && (!chapterIds.length || chapterIds.length > 300 || !startsAt))}>
        {busy ? "Đang xử lý…" : pending ? "Thử lại lưu lịch" : `Hẹn đăng ${chapterIds.length} chương`}
      </Button>
      <Button type="button" variant="ghost" size="sm" fullWidth={false} disabled={busy}
        onClick={() => reload().catch(() => setMessage("Không tải được lịch đăng."))}>Tải lại lịch</Button>
    </div>
    {message && <p role="status" className="text-sm text-stone-dark">{message}</p>}
    {schedules.map((s) => <div key={s.id} className="space-y-1 border-t border-cream-border pt-3 text-sm">
      <div>{statuses[s.status]} · {s.chapter_ids.length} chương · {s.interval_days ? "Mỗi ngày một chương" : "Đăng cùng lúc"}</div>
      <div className="text-xs text-stone-alt">Bắt đầu: {formatter.format(new Date(s.starts_at))} · Đã xử lý {s.next_index}/{s.chapter_ids.length}
        {s.status === "pending" && s.interval_days > 0 && <> · Lượt tiếp: {formatter.format(new Date(Date.parse(s.starts_at) + s.next_index * 86400000))}</>}
      </div>
      {s.error && <p className="text-error">{s.error}</p>}
      {s.status === "pending" && <Button type="button" variant="ghost" size="sm" fullWidth={false} disabled={busy} onClick={() => cancel(s.id)}>Huỷ lịch còn lại</Button>}
    </div>)}
  </div>;
}
