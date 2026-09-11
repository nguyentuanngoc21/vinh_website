"use client";

import { useRef, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent } from "react";

/**
 * Roving-tabindex a11y wrapper for the 4 tab UIs in the app (rankings kind/
 * period tabs, profile tabs) — NONE of them had `role="tablist"/"tab"`,
 * `aria-selected`, or keyboard nav before this. Deliberately NOT a
 * value/onChange-owning component: every existing caller already tracks
 * its own selected value in local state and computes per-tab style itself
 * (pill background, underline border, a subtitle line under the label for
 * rankings' period tabs) — those visual shapes differ enough (see
 * rankings-board.tsx's two very different tab rows) that owning style here
 * would mean re-exposing every one of those knobs as props. Instead this
 * only adds the composable a11y/keyboard layer: `Tabs.List` wraps the
 * existing `.map(...)` of buttons, `Tabs.Tab` replaces the raw `<button>`
 * (same onClick/style props as before, plus `active`).
 *
 * The tìm-kiếm (search) tabs are server-rendered `<Link>`s (full page nav
 * per click, no client state) — architecturally different, not migrated to
 * this component; they got `role="tab"`/`aria-selected` added directly
 * instead (no arrow-key JS needed there, native Tab key already reaches
 * every link).
 */
function TabList({ children, className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  const rootRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;

    let next = -1;
    if (e.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;

    if (next >= 0) {
      e.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    }
  };

  return (
    <div ref={rootRef} role="tablist" onKeyDown={onKeyDown} className={className} {...rest}>
      {children}
    </div>
  );
}

function Tab({
  active,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} className={className} {...rest} />
  );
}

export const Tabs = { List: TabList, Tab };
