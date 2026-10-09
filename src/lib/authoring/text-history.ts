/**
 * Undo/redo history for the chapter editor's textarea. The textarea is
 * controlled by React and the toolbar rewrites its value, which drops the
 * browser's own undo stack — so the editor keeps this one instead.
 * Pure: the caller passes the clock.
 */

export type Selection = { start: number; end: number };
export type HistoryEntry = { value: string; selection: Selection };
/** "type" = keystrokes (grouped), "edit" = toolbar/paste/restore (one step each). */
export type ChangeKind = "type" | "edit";
export type TextHistory = {
  past: HistoryEntry[];
  present: HistoryEntry;
  future: HistoryEntry[];
  lastKind: ChangeKind | null;
  lastAt: number;
};

export const HISTORY_LIMIT = 200;
/** Keystrokes closer together than this undo as one step. */
export const GROUP_MS = 1000;

export function createHistory(value: string, selection: Selection = { start: 0, end: 0 }): TextHistory {
  return { past: [], present: { value, selection }, future: [], lastKind: null, lastAt: 0 };
}

export function record(h: TextHistory, entry: HistoryEntry, kind: ChangeKind, at: number): TextHistory {
  if (entry.value === h.present.value) return { ...h, present: { ...h.present, selection: entry.selection } };
  // Group a typing burst; a new line or a pause starts a new step.
  const typedNewline = entry.value.length > h.present.value.length
    && entry.value.slice(Math.max(0, entry.selection.start - 1), entry.selection.start) === "\n";
  const group = kind === "type" && h.lastKind === "type" && at - h.lastAt < GROUP_MS && !typedNewline && h.past.length > 0;
  const past = group ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT);
  // A new line also closes its own step, so the next keystroke starts fresh.
  return { past, present: entry, future: [], lastKind: typedNewline ? "edit" : kind, lastAt: at };
}

export function undo(h: TextHistory): TextHistory | null {
  const previous = h.past.at(-1);
  if (!previous) return null;
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], lastKind: null, lastAt: 0 };
}

export function redo(h: TextHistory): TextHistory | null {
  const next = h.future[0];
  if (!next) return null;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1), lastKind: null, lastAt: 0 };
}
