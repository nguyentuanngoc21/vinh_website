"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { TOUR_STEPS } from "@/lib/onboarding/tour-steps";

// Bump this if the step list changes shape enough that a previously-seen
// user should be shown the tour again.
const STORAGE_KEY = "vinh-onboarding-tour-v1";

// Same useSyncExternalStore-over-localStorage idea as src/lib/role.tsx and
// src/lib/use-origin.ts: reads "has this browser already seen the tour"
// without calling setState from inside an effect (avoids a cascading
// render on mount). Server snapshot is always "not seen yet" but renders
// nothing either way — see the `!TOUR_STEPS.length` guard is unnecessary,
// the overlay only ever paints once `dismissed` state below allows it.
const noopSubscribe = () => () => {};
function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "done";
  } catch {
    // Storage unreachable (private mode, etc.) — treat as "seen" so the
    // tour never gets stuck trying to persist state it can't write.
    return true;
  }
}
function getServerSnapshot() {
  return true;
}

type Rect = { top: number; left: number; width: number; height: number };

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT_ESTIMATE = 170;
const VIEWPORT_MARGIN = 12;

function measureTarget(selector: string | null): Rect | null {
  if (!selector) return null;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // width/height both 0 means the element is display:none (e.g. the search
  // box is lg:flex-only) — treat exactly like "not found" so the step gets
  // skipped instead of spotlighting an invisible point.
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function computeTooltipPos(
  rect: Rect,
  placement: "top" | "bottom" | "left" | "right" = "bottom"
) {
  const GAP = 16;
  let top = rect.top;
  let left = rect.left;

  switch (placement) {
    case "bottom":
      top = rect.top + rect.height + GAP;
      left = rect.left;
      break;
    case "top":
      top = rect.top - TOOLTIP_HEIGHT_ESTIMATE - GAP;
      left = rect.left;
      break;
    case "left":
      top = rect.top;
      left = rect.left - TOOLTIP_WIDTH - GAP;
      break;
    case "right":
      top = rect.top;
      left = rect.left + rect.width + GAP;
      break;
  }

  const maxLeft = window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN;
  const maxTop = window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - VIEWPORT_MARGIN;
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(maxLeft, VIEWPORT_MARGIN));
  top = Math.min(Math.max(top, VIEWPORT_MARGIN), Math.max(maxTop, VIEWPORT_MARGIN));
  return { top, left };
}

/**
 * Tour hướng dẫn người dùng mới, kiểu Jira: làm tối toàn màn hình, khoét một
 * ô sáng quanh phần tử cần chỉ, kèm thẻ giải thích + nút Tiếp/Quay lại/Bỏ qua.
 * Chỉ chạy một lần cho mỗi trình duyệt (đánh dấu qua localStorage). Mount ở
 * trang chủ — nơi mọi người dùng mới (khách lẫn đã đăng nhập) đều đi qua.
 */
export function ProductTour() {
  const alreadySeen = useSyncExternalStore(noopSubscribe, hasSeenTour, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const active = !alreadySeen && !dismissed;

  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = TOUR_STEPS[stepIndex];

  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      // Không lưu được thì thôi — vẫn đóng tour, chỉ là lần sau có thể hiện lại.
    }
    setDismissed(true);
  }, []);

  const measure = useCallback(() => {
    if (!step) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    const r = measureTarget(step.target);
    if (!r) {
      // Phần tử không tồn tại lúc này (ví dụ khách chưa đăng nhập không có
      // avatar) — bỏ qua bước, không kẹt tour lại.
      setStepIndex((i) => (i < TOUR_STEPS.length - 1 ? i + 1 : i));
      return;
    }
    setRect(r);
  }, [step]);

  useEffect(() => {
    if (!active) return;
    // rAF instead of calling measure() straight in the effect body: the
    // first measurement is layout-dependent (target must be painted), and
    // wrapping it in a callback keeps this in the same "subscribe, then
    // setState from a callback" shape as the resize/scroll listeners below
    // rather than an unconditional synchronous setState during the effect.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active || !step) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const next = () => {
    if (isLast) {
      finish();
      return;
    }
    setStepIndex((i) => i + 1);
  };
  const back = () => setStepIndex((i) => Math.max(0, i - 1));

  const tooltipPos = rect
    ? computeTooltipPos(rect, step.placement)
    : {
        top: window.innerHeight / 2 - TOOLTIP_HEIGHT_ESTIMATE / 2,
        left: window.innerWidth / 2 - TOOLTIP_WIDTH / 2,
      };

  return (
    <>
      {/* Lớp chặn tương tác + làm tối nền. Khi có rect, phần tối thật sự chỉ
          là hiệu ứng thị giác (box-shadow ở khối spotlight bên dưới) — lớp
          này chỉ lo việc chặn click ra ngoài trong lúc tour đang chạy. */}
      <div
        className="fixed inset-0 z-[199]"
        style={{ background: rect ? "transparent" : "rgba(15,15,20,0.65)" }}
        onClick={(e) => e.stopPropagation()}
      />

      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[200] rounded-xl transition-all duration-300 ease-out"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(15,15,20,0.65)",
          }}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        className="fixed z-[201] w-[320px] rounded-2xl border border-cream bg-white p-5 shadow-[0_14px_34px_rgba(0,0,0,.24)] transition-all duration-300 ease-out"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        <div className="mb-1 text-[12px] font-semibold tracking-wide text-brand-gold-dark">
          BƯỚC {stepIndex + 1}/{TOUR_STEPS.length}
        </div>
        <h3 className="mb-1.5 text-[16px] font-bold text-ink">{step.title}</h3>
        <p className="mb-4 text-[14px] leading-relaxed text-stone">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="cursor-pointer text-[13px] font-medium text-stone hover:text-ink"
          >
            Bỏ qua
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={back}
                className="cursor-pointer rounded-full border border-cream px-4 py-2 text-[13px] font-semibold text-ink hover:bg-cream-card"
              >
                Quay lại
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="cursor-pointer rounded-full bg-brand-gold px-4 py-2 text-[13px] font-semibold text-brand-ink hover:brightness-95"
            >
              {isLast ? "Xong" : "Tiếp theo"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
