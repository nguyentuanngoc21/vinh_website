"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, Modal } from "@/components/ui";
import { ROLE_LABEL, STORY_ROLE_LABEL } from "@/lib/characters";
import { foldVietnamese, TERM_KIND_LABEL, type StoryTerm, type StoryTermKind } from "@/lib/story-terms";
import { applyNameFixes, findNameIssues, type NameIssue } from "@/lib/authoring/name-check";
import { diffParagraphs, diffStats } from "@/lib/authoring/paragraph-diff";
import { loadAuthorAppearances, type AuthorAppearances } from "@/components/author/character-scan";
import type { ManagedCharacter } from "@/components/author/character-manager";

const closeBtn = "flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md text-stone-alt hover:bg-info-bg";
const fmtTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

// ---------------------------------------------------------------------------
// Sổ tay truyện — tra cứu nhân vật / địa danh / thuật ngữ khi đang viết.
// ---------------------------------------------------------------------------

type Entry =
  | { type: "character"; key: string; name: string; c: ManagedCharacter }
  | { type: "term"; key: string; name: string; t: StoryTerm };

export function StoryNotebook({ open, onClose, bookId, characters, terms, onInsert, onManageTerms }: {
  open: boolean; onClose: () => void; bookId: string;
  characters: ManagedCharacter[]; terms: StoryTerm[];
  onInsert: (text: string) => void; onManageTerms: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "character" | StoryTermKind>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [appearances, setAppearances] = useState<Record<string, AuthorAppearances | "error">>({});

  const entries = useMemo<Entry[]>(() => [
    ...characters.filter(c => !c.archived_at).map(c => ({ type: "character" as const, key: `c:${c.id}`, name: c.name, c })),
    ...terms.map(t => ({ type: "term" as const, key: `t:${t.id}`, name: t.name, t })),
  ], [characters, terms]);
  const q = foldVietnamese(query.trim());
  const shown = entries.filter(e => {
    if (filter !== "all" && (e.type === "character" ? filter !== "character" : e.t.kind !== filter)) return false;
    if (!q) return true;
    const hay = e.type === "character"
      ? [e.c.name, e.c.aliases, e.c.trope, e.c.description, e.c.private_notes]
      : [e.t.name, e.t.aliases, e.t.description];
    return foldVietnamese(hay.filter(Boolean).join(" ")).includes(q);
  });

  const toggleAppearances = async (c: ManagedCharacter) => {
    const key = `c:${c.id}`;
    setExpanded(expanded === key ? null : key);
    if (appearances[key] && appearances[key] !== "error") return;
    try {
      const data = await loadAuthorAppearances(bookId, c.id);
      setAppearances(prev => ({ ...prev, [key]: data }));
    } catch { setAppearances(prev => ({ ...prev, [key]: "error" })); }
  };

  if (!open) return null;
  const filters: ["all" | "character" | StoryTermKind, string][] = [["all", "Tất cả"], ["character", "Nhân vật"], ...(Object.entries(TERM_KIND_LABEL) as [StoryTermKind, string][])];
  return <div className="fixed inset-0 z-[85] flex justify-end" role="dialog" aria-modal="true" aria-label="Sổ tay truyện">
    <button type="button" aria-label="Đóng sổ tay" className="absolute inset-0 cursor-default bg-black/25" onClick={onClose} />
    <div className="relative flex h-full w-full max-w-[420px] flex-col bg-surface shadow-xl"
      onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
      <div className="flex items-center justify-between gap-2 border-b border-cream-border px-4 py-3">
        <h2 className="text-[16px] font-bold text-brand-ink">Sổ tay truyện</h2>
        <button type="button" className={closeBtn} aria-label="Đóng" onClick={onClose}><XIcon size={18} /></button>
      </div>
      <div className="flex flex-col gap-2 border-b border-cream-border px-4 py-3">
        <input autoFocus aria-label="Tìm trong sổ tay" placeholder="Tìm tên, biệt danh, ghi chú…" value={query} onChange={e => setQuery(e.target.value)}
          className="min-h-10 w-full rounded-lg border border-border-light bg-surface px-3 text-[14px] text-brand-ink outline-none focus:border-brand-ink" />
        <div className="flex gap-1.5 overflow-x-auto">
          {filters.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={`min-h-9 shrink-0 rounded-full px-3 text-[12.5px] ${filter === k ? "bg-brand-navy text-white" : "bg-cream-card text-brand-ink"}`}>{l}</button>)}
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto px-4 py-3">
        {!shown.length && <li className="text-[13px] text-stone-alt">{entries.length ? "Không có mục phù hợp." : "Chưa có nhân vật hay địa danh nào. Thêm bằng “+ Thêm” ở thanh Nhập nhanh."}</li>}
        {shown.map(e => <li key={e.key} className="mb-2.5 rounded-xl border border-cream-border p-3 text-[13px]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="break-words text-[14px] font-semibold text-brand-ink">{e.name}</div>
              <div className="text-[12px] text-stone-alt">
                {e.type === "character"
                  ? `${STORY_ROLE_LABEL[e.c.story_role]} · ${ROLE_LABEL[e.c.role]}${e.c.trope ? ` · ${e.c.trope}` : ""}${e.c.is_public ? "" : " · Riêng tư"}`
                  : TERM_KIND_LABEL[e.t.kind]}
              </div>
            </div>
            <button type="button" onMouseDown={ev => ev.preventDefault()} onClick={() => onInsert(e.name)}
              className="min-h-9 shrink-0 rounded-full bg-cream-card px-3 font-semibold text-brand-ink hover:bg-info-bg">Chèn</button>
          </div>
          {(e.type === "character" ? e.c.aliases : e.t.aliases) && <p className="mt-1 break-words">Tên khác: {e.type === "character" ? e.c.aliases : e.t.aliases}</p>}
          {(e.type === "character" ? e.c.description : e.t.description) && <p className="mt-1 whitespace-pre-wrap break-words">{e.type === "character" ? e.c.description : e.t.description}</p>}
          {e.type === "character" && e.c.private_notes && <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-cream-card p-2 text-stone-dark"><span className="font-semibold">Ghi chú riêng: </span>{e.c.private_notes}</p>}
          <div className="mt-1.5 flex flex-wrap gap-x-4">
            {e.type === "character" ? <>
              <button type="button" className="min-h-9 font-semibold text-brand-gold-dark" aria-expanded={expanded === e.key} onClick={() => toggleAppearances(e.c)}>Chương xuất hiện</button>
              <Link href={`/author/${bookId}`} className="min-h-9 content-center text-stone-alt underline">Sửa hồ sơ</Link>
            </> : <button type="button" className="min-h-9 text-stone-alt underline" onClick={onManageTerms}>Sửa</button>}
          </div>
          {expanded === e.key && <AppearanceList bookId={bookId} data={appearances[e.key]} />}
        </li>)}
      </ul>
    </div>
  </div>;
}

function AppearanceList({ bookId, data }: { bookId: string; data: AuthorAppearances | "error" | undefined }) {
  if (data === undefined) return <p className="mt-1 text-stone-alt">Đang tải…</p>;
  if (data === "error") return <p className="mt-1 text-error">Không tải được danh sách chương.</p>;
  if (!data.chapters.length && !data.otherBooks?.length) return <p className="mt-1 text-stone-alt">Chưa gắn vào chương nào. Dùng “Nhận diện nhân vật” ở trang truyện.</p>;
  return <ul className="mt-1 flex flex-col gap-0.5">
    {data.chapters.map(ch => <li key={ch.id}><Link href={`/author/${bookId}/${ch.id}`} className="text-brand-gold-dark underline">{ch.title || "Chương chưa đặt tên"}</Link>{!ch.published && " (Nháp)"}</li>)}
    {data.otherBooks?.map(b => <li key={b.id} className="text-stone-alt">{b.appearance === "cameo" ? "Khách mời" : `${b.chapters.length} chương`} trong “{b.title}”</li>)}
  </ul>;
}

// ---------------------------------------------------------------------------
// Kiểm tra tên riêng — chương đang mở + cả truyện.
// ---------------------------------------------------------------------------

type BookReport = { chapters: { id: string; title: string; order_index: number; issues: { found: string; expected: string; count: number }[] }[]; scanned: number };
const KIND_LABEL: Record<NameIssue["kind"], string> = { diacritics: "sai dấu", case: "sai hoa/thường", unicode: "mã chữ tổ hợp (dán từ Word)" };

export function NameCheckPanel({ content, names, bookId, chapterId, onApply, onShow, onClose }: {
  content: string; names: string[]; bookId?: string; chapterId?: string;
  onApply: (next: string, message: string) => void;
  onShow: (issue: NameIssue) => void;
  onClose: () => void;
}) {
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<BookReport | "loading" | "error" | null>(null);
  const issues = useMemo(() => findNameIssues(content, names), [content, names])
    .filter(i => !ignored.has(`${i.found}\u0000${i.expected}`));
  const fix = (list: NameIssue[]) => {
    const total = list.reduce((n, i) => n + i.positions.length, 0);
    onApply(applyNameFixes(content, list), `Đã sửa ${total} chỗ. Bấm Hoàn tác nếu muốn trả lại.`);
  };
  const checkBook = async () => {
    if (!bookId) return;
    setReport("loading");
    try {
      const res = await fetch(`/api/authoring/books/${bookId}/name-check`);
      const data = await res.json().catch(() => null);
      setReport(res.ok && data ? data : "error");
    } catch { setReport("error"); }
  };

  return <div className="mb-2 rounded-lg border border-cream-border bg-surface p-3 text-[13px]">
    <div className="mb-2 flex items-start justify-between gap-2">
      <p className="leading-[1.6] text-brand-ink">
        So với {names.length} tên đã đăng ký (nhân vật, biệt danh, địa danh, thuật ngữ) — tìm chỗ viết lệch dấu, lệch hoa/thường.
      </p>
      <button type="button" className={closeBtn} aria-label="Đóng" onClick={onClose}><XIcon size={16} /></button>
    </div>
    {!names.length ? <p className="text-stone-alt">Chưa có tên nào để so. Thêm nhân vật hoặc địa danh ở thanh Nhập nhanh.</p>
      : !issues.length ? <p className="text-success-text">Chương này không có tên viết lệch.</p>
      : <>
        <ul className="flex flex-col gap-1.5">
          {issues.map(i => <li key={`${i.found}|${i.expected}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-cream-card px-2.5 py-1.5">
            <span><span className="font-semibold text-error">{i.found}</span> → <span className="font-semibold text-brand-ink">{i.expected}</span>
              <span className="text-stone-alt"> · {i.positions.length} chỗ · {KIND_LABEL[i.kind]}</span></span>
            <span className="ml-auto flex gap-2">
              <button type="button" className="min-h-9 font-semibold text-brand-gold-dark" onClick={() => onShow(i)}>Xem</button>
              <button type="button" className="min-h-9 font-semibold text-brand-ink" onClick={() => fix([i])}>Sửa</button>
              <button type="button" className="min-h-9 text-stone-alt" onClick={() => setIgnored(s => new Set(s).add(`${i.found}\u0000${i.expected}`))}>Bỏ qua</button>
            </span>
          </li>)}
        </ul>
        {issues.length > 1 && <Button size="sm" fullWidth={false} className="mt-2 min-h-10" onClick={() => fix(issues)}>Sửa tất cả</Button>}
      </>}
    {bookId && names.length > 0 && <div className="mt-3 border-t border-cream-border pt-2">
      <button type="button" className="min-h-9 font-semibold text-brand-gold-dark" disabled={report === "loading"} onClick={checkBook}>
        {report === "loading" ? "Đang kiểm tra cả truyện…" : "Kiểm tra cả truyện"}
      </button>
      {report === "error" && <p role="alert" className="text-error">Không kiểm tra được. Vui lòng thử lại.</p>}
      {report && typeof report === "object" && (report.chapters.length === 0
        ? <p className="text-success-text">Đã kiểm tra {report.scanned} chương — không có tên viết lệch.</p>
        : <ul className="mt-1 flex flex-col gap-1">
          {report.chapters.map(ch => <li key={ch.id}>
            {ch.id === chapterId ? <span className="font-semibold">{ch.title || "Chương chưa đặt tên"} (đang mở)</span>
              : <Link href={`/author/${bookId}/${ch.id}`} className="font-semibold text-brand-gold-dark underline">{ch.title || "Chương chưa đặt tên"}</Link>}
            <span className="text-stone-alt"> · {ch.issues.map(x => `${x.found} ×${x.count}`).join(", ")}</span>
          </li>)}
        </ul>)}
    </div>}
  </div>;
}

// ---------------------------------------------------------------------------
// Lịch sử phiên bản.
// ---------------------------------------------------------------------------

type VersionRow = { id: string; title: string; word_count: number; created_at: string };

export function VersionHistoryModal({ open, onClose, chapterId, currentTitle, currentContent, onRestore }: {
  open: boolean; onClose: () => void; chapterId: string;
  currentTitle: string; currentContent: string;
  onRestore: (title: string, content: string) => void;
}) {
  const [versions, setVersions] = useState<VersionRow[] | "loading" | "error">("loading");
  const [selected, setSelected] = useState<{ id: string; title: string; content: string } | "loading" | "error" | null>(null);
  // Tải lại mỗi lần mở — bản mới có thể vừa được trigger lưu khi tác giả sửa.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setVersions("loading");
      setSelected(null);
      fetch(`/api/authoring/chapters/${chapterId}/versions`)
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => { if (!cancelled) setVersions(ok && Array.isArray(d?.versions) ? d.versions : "error"); },
          () => { if (!cancelled) setVersions("error"); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, chapterId]);

  const pick = async (v: VersionRow) => {
    setSelected("loading");
    try {
      const res = await fetch(`/api/authoring/chapters/${chapterId}/versions/${v.id}`);
      const data = await res.json().catch(() => null);
      setSelected(res.ok && data?.version ? data.version : "error");
    } catch { setSelected("error"); }
  };
  const parts = selected && typeof selected === "object" ? diffParagraphs(selected.content, currentContent) : null;
  const stats = parts ? diffStats(parts) : null;

  return <Modal open={open} onClose={onClose} panelClassName="max-w-[880px] p-5 sm:p-6">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-brand-ink">Lịch sử phiên bản</h2>
        <p className="text-[13px] text-stone-alt">Tự lưu bản cũ mỗi 10 phút khi sửa và trước mỗi thay đổi lớn · giữ 50 bản gần nhất.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Đóng" className={closeBtn}><XIcon size={18} /></button>
    </div>
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <ul className="flex max-h-[30vh] flex-col gap-1 overflow-y-auto md:max-h-[65vh]">
        {versions === "loading" && <li className="text-sm text-stone-alt">Đang tải…</li>}
        {versions === "error" && <li role="alert" className="text-sm text-error">Không tải được lịch sử.</li>}
        {Array.isArray(versions) && !versions.length && <li className="text-sm text-stone-alt">Chưa có phiên bản cũ. Bản cũ được lưu tự động khi bạn sửa nội dung đã lưu.</li>}
        {Array.isArray(versions) && versions.map(v => <li key={v.id}>
          <button type="button" onClick={() => pick(v)}
            className={`w-full rounded-lg px-3 py-2 text-left text-[13px] ${selected && typeof selected === "object" && selected.id === v.id ? "bg-info-bg" : "hover:bg-cream-card"}`}>
            <span className="block font-semibold text-brand-ink">{fmtTime(v.created_at)}</span>
            <span className="text-stone-alt">{v.word_count.toLocaleString("vi-VN")} chữ{v.title !== currentTitle ? ` · “${v.title}”` : ""}</span>
          </button>
        </li>)}
      </ul>
      <div className="min-w-0">
        {!selected && <p className="text-sm text-stone-alt">Chọn một phiên bản để xem khác biệt so với bản đang soạn.</p>}
        {selected === "loading" && <p className="text-sm text-stone-alt">Đang tải…</p>}
        {selected === "error" && <p role="alert" className="text-sm text-error">Không tải được phiên bản.</p>}
        {parts && stats && typeof selected === "object" && selected && <>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-stone-alt">So với bản đang soạn: <span className="text-success-text">+{stats.added}</span> / <span className="text-error">−{stats.removed}</span> đoạn</span>
            <Button size="sm" fullWidth={false} className="ml-auto min-h-10" onClick={() => {
              if (!window.confirm("Đưa phiên bản này vào trình soạn thảo? Bản đang soạn vẫn lấy lại được bằng Hoàn tác, và chỉ thay trên truyện khi bạn lưu/cập nhật.")) return;
              onRestore(selected.title, selected.content);
              onClose();
            }}>Khôi phục bản này</Button>
          </div>
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-cream-border p-3 font-[family-name:var(--font-lora)] text-[15px] leading-[1.8]">
            {stats.added === 0 && stats.removed === 0 && <p className="mb-2 font-sans text-[13px] text-stone-alt">Nội dung giống bản đang soạn.</p>}
            {parts.map((p, i) => <p key={i} className={`mb-2 whitespace-pre-wrap break-words rounded px-1 ${p.kind === "removed" ? "bg-error-bg line-through decoration-error/50" : p.kind === "added" ? "bg-success-form-bg" : ""}`}>
              {p.kind !== "same" && <span className="mr-1 font-sans text-[11px] font-bold">{p.kind === "removed" ? "− Bản cũ" : "+ Hiện tại"}</span>}
              {p.text}
            </p>)}
          </div>
        </>}
      </div>
    </div>
  </Modal>;
}
