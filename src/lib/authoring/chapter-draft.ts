/**
 * Local copy of an unsaved chapter edit (per browser), so a crash, a closed
 * tab or a failed save never loses text. Per-viewer convenience only — the
 * server copy stays the source of truth; every access is try/catch because
 * storage can be unavailable (private mode, blocked site data).
 */
export type ChapterDraft = { title: string; content: string; savedAt: number; baseVersion: number };

const key = (chapterId: string) => `vinh_chapter_draft:${chapterId}`;

export function readChapterDraft(chapterId: string): ChapterDraft | null {
  try {
    const raw = localStorage.getItem(key(chapterId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<ChapterDraft>;
    if (typeof d.title !== "string" || typeof d.content !== "string" || typeof d.savedAt !== "number") return null;
    return { title: d.title, content: d.content, savedAt: d.savedAt, baseVersion: typeof d.baseVersion === "number" ? d.baseVersion : -1 };
  } catch {
    return null;
  }
}

export function writeChapterDraft(chapterId: string, draft: ChapterDraft) {
  try { localStorage.setItem(key(chapterId), JSON.stringify(draft)); } catch { /* quota/blocked: server autosave still runs */ }
}

export function clearChapterDraft(chapterId: string) {
  try { localStorage.removeItem(key(chapterId)); } catch { /* ignore */ }
}
