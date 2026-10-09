"use client";

import { useEffect, useRef, useState } from "react";

const MAX = 10_000;
const SAVE_MS = 1200;

/**
 * Ghi chú & dàn ý riêng cho chương (chapter_notes) — độc giả không bao giờ
 * thấy. Tự lưu sau khi ngừng gõ; lỗi thì giữ nguyên chữ để thử lại.
 */
export function ChapterNotesPanel({ chapterId, onHasNotes }: { chapterId: string; onHasNotes?: (has: boolean) => void }) {
  const [notes, setNotes] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saved = useRef("");
  const onHasNotesRef = useRef(onHasNotes);
  useEffect(() => { onHasNotesRef.current = onHasNotes; });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/authoring/chapters/${chapterId}/notes`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        const text = ok && typeof d?.notes === "string" ? d.notes : "";
        saved.current = text;
        setNotes(text);
        onHasNotesRef.current?.(text.trim() !== "");
        if (!ok) setStatus("error");
      }, () => { if (!cancelled) { setNotes(""); setStatus("error"); } });
    return () => { cancelled = true; };
  }, [chapterId]);

  useEffect(() => {
    if (notes === null || notes === saved.current) return;
    const timer = setTimeout(async () => {
      setStatus("saving");
      try {
        const res = await fetch(`/api/authoring/chapters/${chapterId}/notes`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }),
        });
        if (!res.ok) throw new Error();
        saved.current = notes;
        onHasNotesRef.current?.(notes.trim() !== "");
        setStatus("saved");
      } catch { setStatus("error"); }
    }, SAVE_MS);
    return () => clearTimeout(timer);
  }, [notes, chapterId]);

  if (notes === null) return <p className="text-[13px] text-stone-alt">Đang tải…</p>;
  return <div className="flex flex-col gap-2">
    <textarea
      aria-label="Ghi chú và dàn ý của chương"
      value={notes}
      maxLength={MAX}
      onChange={e => setNotes(e.target.value)}
      rows={7}
      placeholder={"Dàn ý, ý tưởng, việc cần sửa…\n• Mở đầu: …\n• Cao trào: …"}
      className="w-full resize-y rounded-lg border border-border-light bg-surface p-3 text-[14px] leading-[1.6] text-brand-ink outline-none focus:border-brand-ink"
    />
    <p role="status" className={`text-[12px] ${status === "error" ? "text-error" : "text-stone-alt"}`}>
      {status === "saving" ? "Đang lưu…" : status === "saved" ? "Đã lưu" : status === "error" ? "Chưa lưu được — sẽ thử lại khi bạn gõ tiếp." : "Chỉ mình bạn thấy, không hiện cho độc giả."}
      {" · "}{notes.length.toLocaleString("vi-VN")}/{MAX.toLocaleString("vi-VN")}
    </p>
  </div>;
}
