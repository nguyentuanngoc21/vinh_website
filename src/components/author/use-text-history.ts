"use client";

import { useCallback, useState } from "react";
import { createHistory, record, redo, undo, type ChangeKind, type HistoryEntry, type Selection } from "@/lib/authoring/text-history";

/** Chapter content plus its undo/redo stack (src/lib/authoring/text-history.ts). */
export function useTextHistory(initial: string) {
  const [history, setHistory] = useState(() => createHistory(initial));

  const set = useCallback((value: string, selection?: Selection, kind: ChangeKind = "edit") => {
    const at = Date.now();
    setHistory(prev => record(prev, { value, selection: selection ?? prev.present.selection }, kind, at));
  }, []);

  const step = (move: typeof undo): HistoryEntry | null => {
    const next = move(history);
    if (!next) return null;
    setHistory(next);
    return next.present;
  };

  return {
    value: history.present.value,
    set,
    undo: () => step(undo),
    redo: () => step(redo),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
