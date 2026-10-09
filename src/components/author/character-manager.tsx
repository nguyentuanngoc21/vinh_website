"use client";

import { useEffect, useRef, useState } from "react";
import { Field } from "@/components/ui";
import { CharacterForm, type CharacterDraft } from "./character-form";
import { CharacterAppearanceDetails, CharacterScanPanel, loadAuthorAppearances, saveReview, toPopoverBooks, type AuthorAppearances } from "./character-scan";
import { CharacterAppearancePopover } from "@/components/story/character-appearance-popover";
import { DELETE_WINDOW_MS, ROLE_LABEL, STORY_ROLE_LABEL, type CharacterProfile } from "@/lib/characters";
import type { ScanResult } from "@/lib/authoring/character-scan";

export type ManagedCharacter = CharacterProfile;

export function CharacterManager({ bookId, initialCharacters }: { bookId: string; initialCharacters: ManagedCharacter[] }) {
  const [characters, setCharacters] = useState(initialCharacters);
  const [editing, setEditing] = useState<ManagedCharacter | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState("created");
  const [appearances, setAppearances] = useState<Record<string, AuthorAppearances>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scan, setScan] = useState<{ id: string; result: ScanResult } | null>(null);
  // Client clock only decides whether to offer the button; the RPC enforces the window.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0), timer = setInterval(tick, 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  const minutesLeft = (c: ManagedCharacter) => {
    const left = now === null ? 0 : DELETE_WINDOW_MS - (now - Date.parse(c.created_at));
    return left > 0 ? Math.ceil(left / 60_000) : 0;
  };
  const url = (id?: string) => `/api/authoring/books/${bookId}/characters${id ? `/${id}` : ""}`;
  const mutate = async (body: CharacterDraft | { archived: boolean }, id?: string, message = "Đã lưu nhân vật.") => {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(null); setStatus("");
    try {
      const res = await fetch(url(id), { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.character) throw new Error(data.error || "Không lưu được nhân vật.");
      setCharacters(prev => id ? prev.map(c => c.id === id ? data.character : c) : [...prev, data.character]);
      setStatus(message);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Không kết nối được máy chủ."); return false; }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = async (c: ManagedCharacter) => {
    if (lock.current || !window.confirm(`Xoá vĩnh viễn “${c.name}”? Chỉ dùng khi tạo nhầm: nhân vật và các liên kết chương sẽ bị xoá, không thể khôi phục.`)) return;
    lock.current = true; setBusy(true); setError(null); setStatus("");
    try {
      const res = await fetch(`${url(c.id)}/permanent`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Không xoá được nhân vật.");
      setCharacters(prev => prev.filter(x => x.id !== c.id));
      setStatus(`Đã xoá “${c.name}”.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Không kết nối được máy chủ."); }
    finally { lock.current = false; setBusy(false); }
  };
  const loadAppearances = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const data = await loadAuthorAppearances(bookId, id);
      setAppearances(prev => ({ ...prev, [id]: data })); setExpanded(id);
    } catch (e) { setError(e instanceof Error ? e.message : "Không tải được chương."); }
    finally { lock.current = false; setBusy(false); }
  };
  // Reload after a review so the expanded list and the hover popover stay current.
  const refreshAppearances = async (id: string) => {
    try { const data = await loadAuthorAppearances(bookId, id); setAppearances(prev => ({ ...prev, [id]: data })); }
    catch { setAppearances(prev => { const next = { ...prev }; delete next[id]; return next; }); }
  };
  const runScan = async (c: ManagedCharacter) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setStatus(""); setScan(null);
    try {
      const res = await fetch(`${url(c.id)}/scan`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ownBook) throw new Error(data?.error || "Không quét được truyện.");
      setScan({ id: c.id, result: data });
    } catch (e) { setError(e instanceof Error ? e.message : "Không kết nối được máy chủ."); }
    finally { lock.current = false; setBusy(false); }
  };
  const resetReview = async (id: string, review: Parameters<typeof saveReview>[2], message: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setStatus("");
    try { await saveReview(bookId, id, review); await refreshAppearances(id); setStatus(message); }
    catch (e) { setError(e instanceof Error ? e.message : "Không kết nối được máy chủ."); }
    finally { lock.current = false; setBusy(false); }
  };
  const shown = characters.filter(c => {
    const match = `${c.name} ${c.aliases ?? ""} ${c.trope ?? ""}`.toLocaleLowerCase("vi").includes(search.trim().toLocaleLowerCase("vi"));
    return match && (role === "all" || c.role === role || c.story_role === role)
      && (filter === "all" || (filter === "archived" ? !!c.archived_at : filter === "public" ? !c.archived_at && c.is_public : filter === "private" ? !c.archived_at && !c.is_public : !c.archived_at));
  });
  const archivedCount = characters.filter(c => c.archived_at).length;
  if (sort === "name") shown.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  if (sort === "role") shown.sort((a, b) => ["main", "supporting", "cameo"].indexOf(a.story_role) - ["main", "supporting", "cameo"].indexOf(b.story_role));
  return <section aria-label="Quản lý nhân vật" className="mb-6 rounded-xl border border-cream-border bg-surface p-5">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-bold">Nhân vật ({characters.length})</h2>
      <button type="button" disabled={busy || editing !== null} onClick={() => { setEditing("new"); setError(null); }} className="rounded-lg bg-brand-gold px-3 py-2 text-sm font-semibold disabled:opacity-50">Thêm nhân vật</button></div>
    {error && <p role="alert" className="mb-3 text-sm text-error">{error}</p>}
    <p role="status" className="mb-3 text-sm text-stone-alt">{busy ? "Đang xử lý…" : status}</p>
    {editing !== null && <div className="mb-4"><CharacterForm bookId={bookId} key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing}
      names={characters.filter(c => editing === "new" || c.id !== editing.id).map(c => c.name)} busy={busy}
      onCancel={() => setEditing(null)} onSave={async draft => { const ok = await mutate(draft, editing === "new" ? undefined : editing.id); if (ok) setEditing(null); return ok; }} /></div>}
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      <Field label="Tìm nhân vật" placeholder="Tên, biệt danh, mẫu hình…" value={search} onChange={e => setSearch(e.target.value)} />
      <label className="text-sm">Trạng thái<select aria-label="Trạng thái" value={filter} onChange={e => setFilter(e.target.value)} className="mt-2 block w-full rounded-lg border p-3">
        <option value="active">Đang sử dụng</option><option value="public">Công khai</option><option value="private">Riêng tư</option><option value="archived">Đã lưu trữ ({archivedCount})</option><option value="all">Tất cả</option>
      </select></label>
      <label className="text-sm">Vai trò<select aria-label="Lọc vai trò" value={role} onChange={e => setRole(e.target.value)} className="mt-2 block w-full rounded-lg border p-3"><option value="all">Tất cả vai trò</option>
        {Object.entries({ ...STORY_ROLE_LABEL, ...ROLE_LABEL }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>
      <label className="text-sm">Sắp xếp<select aria-label="Sắp xếp" value={sort} onChange={e => setSort(e.target.value)} className="mt-2 block w-full rounded-lg border p-3"><option value="created">Thứ tự tạo</option><option value="name">Tên A–Z</option><option value="role">Chính → phụ → khách mời</option></select></label>
    </div>
    {filter === "active" && archivedCount > 0 && <button type="button" onClick={() => setFilter("archived")}
      className="mb-3 min-h-11 text-sm font-semibold text-brand-gold-dark underline">Xem {archivedCount} nhân vật đã lưu trữ để khôi phục</button>}
    {!shown.length && <p className="text-sm text-stone-alt">{characters.length ? "Không có nhân vật phù hợp bộ lọc." : "Chưa có nhân vật. Thêm hồ sơ để quản lý và gắn vào chương."}</p>}
    <div className="flex flex-col gap-3">{shown.map(c => <article key={c.id} className="rounded-xl border border-cream-border p-4">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.avatar_url && <img src={c.avatar_url} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-12 w-12 rounded-full object-cover" />}
        <div className="min-w-0"><h3 className="break-words font-semibold">
          <CharacterAppearancePopover label={c.name} chapterHref={(b, ch) => `/author/${b}/${ch}`}
            books={appearances[c.id] && toPopoverBooks(bookId, appearances[c.id])}
            load={async () => { const data = await loadAuthorAppearances(bookId, c.id); setAppearances(prev => ({ ...prev, [c.id]: data })); return toPopoverBooks(bookId, data); }} />
        </h3><p className="text-xs text-stone-alt">{STORY_ROLE_LABEL[c.story_role]} · {ROLE_LABEL[c.role]} · {c.archived_at ? "Đã lưu trữ" : c.is_public ? "Công khai" : "Riêng tư"}{!c.show_role && " · Ẩn chính/phản diện"}</p>
          {c.aliases && <p className="text-sm">Tên khác: {c.aliases}</p>}{c.trope && <p className="text-sm">Mẫu hình: {c.trope}</p>}</div>
      </div>
      {c.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{c.description}</p>}
      {c.private_notes && <details className="mt-2 text-sm"><summary>Ghi chú riêng</summary><p className="whitespace-pre-wrap break-words">{c.private_notes}</p></details>}
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <button type="button" disabled={busy || editing !== null} onClick={() => setEditing(c)} className="font-semibold text-brand-gold-dark disabled:opacity-50">Sửa</button>
        <button type="button" disabled={busy || editing !== null} onClick={async () => {
          if (!c.archived_at && !window.confirm(`Lưu trữ “${c.name}”? Nhân vật sẽ ẩn với độc giả. Liên kết chương, lượt theo dõi và bình chọn được giữ nguyên; bạn có thể khôi phục sau.`)) return;
          await mutate({ archived: !c.archived_at }, c.id, c.archived_at ? `Đã khôi phục “${c.name}”.` : `Đã lưu trữ “${c.name}”. Chọn “Đã lưu trữ” ở bộ lọc Trạng thái để khôi phục.`);
        }} className="disabled:opacity-50">{c.archived_at ? "Khôi phục" : "Lưu trữ"}</button>
        {minutesLeft(c) > 0 && <button type="button" disabled={busy || editing !== null} onClick={() => remove(c)}
          className="text-error disabled:opacity-50">Xoá (còn {minutesLeft(c)} phút)</button>}
        <button type="button" disabled={busy} aria-expanded={expanded === c.id} onClick={() => loadAppearances(c.id)} className="disabled:opacity-50">{appearances[c.id] ? `${appearances[c.id].chapters.length} chương xuất hiện` : "Xem chương xuất hiện"}</button>
        {!c.archived_at && <button type="button" disabled={busy || editing !== null} onClick={() => runScan(c)}
          className="font-semibold text-brand-gold-dark disabled:opacity-50">Nhận diện nhân vật</button>}
      </div>
      {scan?.id === c.id && <CharacterScanPanel bookId={bookId} characterId={c.id} characterName={c.name} result={scan.result}
        onClose={() => setScan(null)}
        onSaved={async message => { setScan(null); setStatus(message); await refreshAppearances(c.id); setExpanded(c.id); }} />}
      {expanded === c.id && appearances[c.id] && <CharacterAppearanceDetails bookId={bookId} characterId={c.id} data={appearances[c.id]} busy={busy}
        onReset={(review, message) => resetReview(c.id, review, message)} />}
    </article>)}</div>
  </section>;
}
