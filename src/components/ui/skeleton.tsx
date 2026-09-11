/**
 * Shimmer placeholder for content still loading — the repo previously had
 * NO skeleton anywhere, every loading state was a plain "Đang tải…" text
 * line (see following-tab.tsx/edit-profile-tab.tsx before this component,
 * plus a longer backlog of other "Đang tải…" spots not touched in this
 * pass: achievements-page.tsx, reading-list-modal.tsx, services-tab.tsx,
 * identity-form.tsx, daily-tasks-tab.tsx, chat-tab.tsx, bank-info-form.tsx,
 * agreements-tab.tsx — swap those over gradually, not all at once here).
 *
 * Just a shaped `animate-pulse` block — pass `className` to size/shape it
 * (e.g. `h-4 w-32 rounded-[var(--radius-sm)]` for a text line, `size-14
 * rounded-full` for an avatar).
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-cream-card-alt ${className}`} />;
}
