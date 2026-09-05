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
// Ước lượng rộng rãi hơn kích thước thực tế: trên màn hẹp, tooltip co lại
// theo bề rộng (xem TOOLTIP_WIDTH/computeTooltipLayout) nên chữ xuống dòng
// nhiều hơn — số này chỉ dùng để chừa chỗ khi tính "top"/"bottom" placement
// và clamp trong viewport, thà hụt còn hơn để thẻ tràn khỏi màn hình.
const TOOLTIP_HEIGHT_ESTIMATE = 190;
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

// Điện thoại xoay dọc thường hẹp hơn 320px tooltip + lề hai bên, và không
// còn chỗ để đặt thẻ giải thích sang trái/phải mục tiêu (bookmark, CTA,
// avatar đều nằm sát mép phải header). Dưới ngưỡng này, luôn ép thẻ xuống
// dưới (hoặc lên trên nếu không đủ chỗ) thay vì left/right — bám sát mục
// tiêu thay vì bị đẩy dạt sang một bên do code clamp phía dưới.
const NARROW_VIEWPORT_BREAKPOINT = 640;

type TooltipLayout = { top: number; left: number };

// Bề rộng thật sự dùng lúc render là class Tailwind `w-[min(320px,92vw)]`
// (xem JSX bên dưới) — con số 0.92 ở đây CHỈ để tính toán clamp cho đúng,
// phải khớp với "92vw" trong class đó chứ không tự ý đổi một bên.
function computeTooltipLayout(
  rect: Rect,
  requestedPlacement: "top" | "bottom" | "left" | "right" = "bottom"
): TooltipLayout {
  const GAP = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(TOOLTIP_WIDTH, vw * 0.92);

  let placement = requestedPlacement;
  if (vw < NARROW_VIEWPORT_BREAKPOINT && (placement === "left" || placement === "right")) {
    const roomBelow = vh - (rect.top + rect.height);
    placement = roomBelow > TOOLTIP_HEIGHT_ESTIMATE + GAP ? "bottom" : "top";
  }

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
      left = rect.left - width - GAP;
      break;
    case "right":
      top = rect.top;
      left = rect.left + rect.width + GAP;
      break;
  }

  const maxLeft = vw - width - VIEWPORT_MARGIN;
  const maxTop = vh - TOOLTIP_HEIGHT_ESTIMATE - VIEWPORT_MARGIN;
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

  // Không có rect (bước chào mừng/kết thúc) → để CSS tự canh giữa
  // (top:50%/left:50%/translate) thay vì tự tính bằng window.innerWidth/
  // innerHeight đọc một lần lúc render: giá trị đó có thể sai lệch nhất
  // thời ngay lúc trang mới tải trên di động (thanh địa chỉ trình duyệt
  // chưa ổn định chiều cao thật), và vì bước này không có rect để đổi,
  // component sẽ không bao giờ vẽ lại để tự sửa — card bị kẹt lệch vĩnh
  // viễn. CSS centering do trình duyệt tính lại mỗi lần reflow nên luôn
  // đúng, không phụ thuộc thời điểm đọc window.
  const tooltipLayout: TooltipLayout | null = rect
    ? computeTooltipLayout(rect, step.placement)
    : null;

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
        className={`fixed z-[201] w-[min(320px,92vw)] rounded-2xl border border-cream bg-white p-4 shadow-[0_14px_34px_rgba(0,0,0,.24)] transition-all duration-300 ease-out sm:p-5${
          tooltipLayout ? "" : " top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        }`}
        style={tooltipLayout ? { top: tooltipLayout.top, left: tooltipLayout.left } : undefined}
      >
        <div className="mb-1 text-[12px] font-semibold tracking-wide text-brand-gold-dark">
          BƯỚC {stepIndex + 1}/{TOUR_STEPS.length}
        </div>
        <h3 className="mb-1.5 text-[16px] font-bold text-ink">{step.title}</h3>
        <p className="mb-4 text-[14px] leading-relaxed text-stone">{step.body}</p>
        {/* Đảo ngược thứ tự khi xếp dọc: nhóm nút chính (Quay lại/Tiếp theo)
            hiện phía trên, "Bỏ qua" phụ ở dưới — trên màn dọc điện thoại
            không đủ chỗ xếp cả 3 nút trên một hàng như ở màn rộng. */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                className="flex-1 cursor-pointer rounded-full border border-cream px-4 py-2 text-[13px] font-semibold text-ink hover:bg-cream-card sm:flex-none"
              >
                Quay lại
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="flex-1 cursor-pointer rounded-full bg-brand-gold px-4 py-2 text-[13px] font-semibold text-brand-ink hover:brightness-95 sm:flex-none"
            >
              {isLast ? "Xong" : "Tiếp theo"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
