/**
 * What the reader counts as a screenshot/copy attempt (src/components/reading/reader.tsx →
 * /api/penalty, which can deduct xu and lock reading). Kept narrow on purpose: an earlier version
 * matched "s"/"S" with ANY modifier across the whole page, so typing a capital S in the comment
 * box — or copying one's own comment — counted as an offence (fixed 24/09/2026).
 */
type KeyLike = { key: string; code?: string; metaKey: boolean; ctrlKey: boolean };
type ElementLike = { isContentEditable?: boolean; tagName?: string } | null | undefined;

/** Typing or selecting inside a form field never counts. */
export function isEditableTarget(target: ElementLike): boolean {
  if (!target || typeof target !== "object") return false;
  return !!target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName ?? "");
}

/** PrintScreen, Win/Cmd+Shift+S (Snipping Tool / macOS save) and Ctrl/Cmd+S (save page). */
export function isCaptureShortcut(event: KeyLike): boolean {
  if (event.key === "PrintScreen" || event.code === "PrintScreen" || event.key === "F13") return true;
  return (event.key === "s" || event.key === "S") && (event.metaKey || event.ctrlKey);
}
