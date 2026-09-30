"use client";

// Hệ thống chống chụp màn hình/sao chép của trang đọc — tách nguyên văn từ
// reader.tsx thành hook. Bảng phạt dùng chung với
// src/app/api/penalty/route.ts qua src/lib/penalty/rules.ts (server là
// nguồn sự thật; nhánh tính phạt ở đây chỉ là fallback offline khi gọi
// server thất bại, xem applyPenalty bên dưới).

import { useEffect, useRef, useState, type RefObject } from "react";
import { isCaptureShortcut, isEditableTarget } from "@/lib/reading/capture-detection";
import {
  getAppliedPenaltyRule,
  getNextPenalty,
  getPenaltyDeduction,
  PENALTY_DAY_MS,
} from "@/lib/penalty/rules";

const PENALTY_STORAGE_KEY = "vinh_screenshot_penalty";

export type PenaltyState = {
  count: number;
  expiresAt: number | null;
  banned: boolean;
  lastOffenseAt: number | null;
  deductedAmount: number | null;
};

function getPenaltyState(): PenaltyState {
  try {
    const raw = localStorage.getItem(PENALTY_STORAGE_KEY);
    if (!raw) return { count: 0, expiresAt: null, banned: false, lastOffenseAt: null, deductedAmount: null };
    const parsed = JSON.parse(raw) as PenaltyState;
    if (parsed.banned) return parsed;
    if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
      return { ...parsed, expiresAt: null, deductedAmount: null };
    }
    return parsed;
  } catch {
    return { count: 0, expiresAt: null, banned: false, lastOffenseAt: null, deductedAmount: null };
  }
}

function savePenaltyState(state: PenaltyState) {
  try {
    localStorage.setItem(PENALTY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
}

export function formatPenaltyMessage(penalty: PenaltyState) {
  if (penalty.banned) {
    return "Tài khoản này đã bị cấm vĩnh viễn vì vi phạm quy tắc chụp màn hình.";
  }

  // count=1 = lần cảnh báo đầu tiên (không có rule/expiresAt thật — xem
  // getNextPenalty) -> rule ở đây luôn undefined cho count=1, trả về null
  // là đúng (banner cảnh báo tức thời warningMessage đã lo phần hiển thị
  // lúc đó, không cần banner thường trực này lặp lại).
  const rule = getAppliedPenaltyRule(penalty.count);
  if (!rule || !penalty.expiresAt) return null;
  const expiry = new Date(penalty.expiresAt).toLocaleDateString("vi-VN");
  const baseMessage = `Lần ${penalty.count}: tính thêm ${rule.percent}% token để mở khóa truyện đến ${expiry}.`;
  if (penalty.deductedAmount) {
    return `${baseMessage} Đã trừ ${penalty.deductedAmount} token cho lần vi phạm này.`;
  }
  return baseMessage;
}

function normalizePenaltyState(payload: {
  screenshot_penalty_count?: number;
  screenshot_penalty_expires_at?: string | null;
  screenshot_penalty_banned?: boolean;
  screenshot_penalty_last_offense_at?: string | null;
  last_deducted_amount?: number | null;
  lastDeductedAmount?: number | null;
}): PenaltyState {
  return {
    count: payload.screenshot_penalty_count ?? 0,
    expiresAt: payload.screenshot_penalty_expires_at
      ? new Date(payload.screenshot_penalty_expires_at).getTime()
      : null,
    banned: Boolean(payload.screenshot_penalty_banned),
    lastOffenseAt: payload.screenshot_penalty_last_offense_at
      ? new Date(payload.screenshot_penalty_last_offense_at).getTime()
      : null,
    deductedAmount: payload.last_deducted_amount ?? payload.lastDeductedAmount ?? null,
  };
}

async function fetchPenaltyStateFromServer(): Promise<PenaltyState | null> {
  try {
    const res = await fetch("/api/penalty");
    if (!res.ok) return null;
    const payload = await res.json();
    if (typeof payload?.screenshot_penalty_count !== "number") return null;
    return normalizePenaltyState(payload);
  } catch {
    return null;
  }
}

async function postScreenshotPenaltyToServer(): Promise<{ state: PenaltyState; warningOnly: boolean } | null> {
  try {
    const res = await fetch("/api/penalty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "screenshot" }),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (typeof payload?.screenshot_penalty_count !== "number") return null;
    return { state: normalizePenaltyState(payload), warningOnly: Boolean(payload?.warning_only) };
  } catch {
    return null;
  }
}

const NO_PENALTY: PenaltyState = { count: 0, expiresAt: null, banned: false, lastOffenseAt: null, deductedAmount: null };

/** `paragraphRefs` — các đoạn nội dung chương; chỉ sao chép chữ NẰM TRONG
 * các đoạn này mới bị tính là vi phạm (xem onCopy).
 *
 * `exempt` — admin/super_admin: không phát hiện, không gọi /api/penalty, không
 * hiện phạt (kể cả trạng thái cũ còn lưu ở localStorage). Server cũng tự
 * miễn cho 2 role này (api/penalty/route.ts) — đây chỉ là lớp giao diện. */
export function useScreenshotPenalty(
  paragraphRefs: RefObject<Array<HTMLParagraphElement | null>>,
  { exempt = false }: { exempt?: boolean } = {}
) {
  const [penalty, setPenalty] = useState<PenaltyState>({ count: 0, expiresAt: null, banned: false, lastOffenseAt: null, deductedAmount: null });
  // penalty ban đầu luôn count:0 (giá trị thật chỉ tới sau 1 lượt tải từ
  // localStorage/server) — onKeyDown/onCopy bên dưới đăng ký 1 lần lúc
  // mount (deps []), đọc qua ref này thay vì đóng closure lên `penalty`
  // trực tiếp để đoán "lần đầu hay không" luôn dùng giá trị MỚI NHẤT tại
  // thời điểm người dùng thật sự bấm, không phải giá trị lúc effect chạy.
  const penaltyRef = useRef(penalty);
  useEffect(() => {
    penaltyRef.current = penalty;
  }, [penalty]);
  const [screenshotDetected, setScreenshotDetected] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const penaltyAppliedRef = useRef(false);
  // "Giờ hiện tại" cho isPenaltyActive bên dưới — KHÔNG gọi Date.now() trực
  // tiếp lúc render (react-hooks/purity: gọi hàm impure trong render có thể
  // cho kết quả khác nhau giữa các lần render, gây lệch nếu React sau này
  // render lại 1 lần build/commit nhiều lần — vd bật React Compiler).
  // null lúc mount đầu (trước khi effect chạy) — coi như "chưa có phạt" cho
  // tới khi có mốc giờ thật, khớp cách `penalty` cũng khởi tạo rỗng rồi mới
  // nạp state thật ở effect bên dưới.
  const [now, setNow] = useState<number | null>(null);


  const isPenaltyActive = penalty.banned || (!!penalty.expiresAt && now !== null && penalty.expiresAt > now);

  useEffect(() => {
    if (exempt) return;
    const loadPenalty = async () => {
      const serverState = await fetchPenaltyStateFromServer();
      if (serverState) {
        savePenaltyState(serverState);
        setPenalty(serverState);
        return;
      }

      setPenalty(getPenaltyState());
    };

    loadPenalty();
  }, [exempt]);

  // Cấp "giờ hiện tại" cho isPenaltyActive từ effect (client-only), không
  // gọi Date.now() lúc render. 30s/lần là đủ mịn — hạn phạt tính theo NGÀY
  // (3/7/14/30 ngày, xem PENALTY_RULES ở src/lib/penalty/rules.ts), không
  // cần chính xác tới giây; tick định kỳ giúp phạt tự hết hiệu lực trên UI
  // mà không cần refresh trang.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    // setTimeout(0) thay vì gọi tick() đồng bộ ngay dòng đầu effect —
    // react-hooks/set-state-in-effect không cho setState đồng bộ ngay
    // trong thân effect (xem cùng cách xử lý ở reading-list-modal.tsx).
    const timeout = setTimeout(tick, 0);
    const interval = setInterval(tick, 30_000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!screenshotDetected || penaltyAppliedRef.current) return;
    penaltyAppliedRef.current = true;

    const applyPenalty = async () => {
      const result = await postScreenshotPenaltyToServer();
      if (result) {
        savePenaltyState(result.state);
        setPenalty(result.state);
        setWarningMessage(
          result.warningOnly
            ? "Đây là lần đầu hệ thống phát hiện — chưa trừ token lần này. Lần tới sẽ bị trừ token và khoá nội dung tạm thời."
            : result.state.banned
              ? "Bạn đã bị cấm vì chụp màn hình."
              : `Đã áp dụng phạt. Số token trừ: ${result.state.deductedAmount ?? 0}`
        );
        return;
      }

      if (penalty.banned) {
        return;
      }

      const now = Date.now();
      const nextCount = penalty.count + 1;
      const next = getNextPenalty(penalty.count);

      if ("warning" in next) {
        // Server không phản hồi được — vẫn cho qua với cảnh báo cục bộ,
        // KHÔNG tự trừ token/khoá nội dung phía client (nguồn sự thật là
        // server; chỉ ghi nhận count để lần sau không lặp lại cảnh báo).
        const warnedState: PenaltyState = {
          count: nextCount,
          expiresAt: null,
          banned: false,
          lastOffenseAt: now,
          deductedAmount: null,
        };
        savePenaltyState(warnedState);
        setPenalty(warnedState);
        setWarningMessage(
          "Đây là lần đầu hệ thống phát hiện — chưa trừ token lần này. Lần tới sẽ bị trừ token và khoá nội dung tạm thời."
        );
        return;
      }

      setWarningMessage("Không thể cập nhật phạt đến server. Phạt vẫn được ghi cục bộ.");

      if ("ban" in next && next.ban) {
        const bannedState: PenaltyState = {
          count: nextCount,
          expiresAt: null,
          banned: true,
          lastOffenseAt: now,
          deductedAmount: null,
        };
        savePenaltyState(bannedState);
        setPenalty(bannedState);
        return;
      }

      const expiresAt = now + next.durationDays * PENALTY_DAY_MS;
      const nextState: PenaltyState = {
        count: nextCount,
        expiresAt,
        banned: false,
        lastOffenseAt: now,
        deductedAmount: getPenaltyDeduction("percent" in next ? next.percent : 0),
      };
      savePenaltyState(nextState);
      setPenalty(nextState);
    };

    applyPenalty();
  }, [screenshotDetected, penalty]);

  useEffect(() => {
    // Thông điệp cảnh báo TỨC THỜI (trước khi biết chắc server trả lời gì)
    // — đoán trước dựa trên penaltyRef.current.count (giá trị MỚI NHẤT tại
    // thời điểm bấm, xem khai báo penaltyRef ở trên): count===0 nghĩa là
    // lần vi phạm SẮP TỚI sẽ chỉ là cảnh báo (xem getNextPenalty), count>=1
    // nghĩa là lần này sẽ bị trừ token/khoá thật. applyPenalty ở trên sẽ
    // ghi đè thông điệp này bằng phản hồi thật từ server ngay sau đó — đây
    // chỉ là phản hồi tức thời trong lúc chờ.
    // Chỉ phím tắt chụp/lưu thật, bỏ qua ô nhập liệu — xem
    // src/lib/reading/capture-detection.ts (lỗi Shift+S trước đây).
    if (exempt) return;
    const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && isEditableTarget(target);
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (isCaptureShortcut(event)) {
        setScreenshotDetected(true);
        setWarningMessage(
          penaltyRef.current.count === 0
            ? "Hệ thống đã phát hiện hành vi chụp màn hình — đây là lần đầu nên chỉ cảnh báo."
            : "Hệ thống đã phát hiện hành vi chụp màn hình và đang áp dụng phạt."
        );
      }
    };

    const onCopy = (event: ClipboardEvent) => {
      // Chỉ tính khi sao chép NỘI DUNG CHƯƠNG — không tính chữ trong ô nhập
      // liệu, bình luận hay phần giao diện khác của trang.
      if (isTyping(event.target) || isTyping(document.activeElement)) return;
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) return;
      if (!paragraphRefs.current.some((p) => p && selection.containsNode(p, true))) return;
      setScreenshotDetected(true);
      setWarningMessage(
        penaltyRef.current.count === 0
          ? "Hệ thống đã phát hiện hành vi sao chép/chụp màn hình — đây là lần đầu nên chỉ cảnh báo."
          : "Hệ thống đã phát hiện hành vi sao chép/chụp màn hình và đang áp dụng phạt."
      );
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
    };
    // paragraphRefs là ref object ổn định (useRef ở reader.tsx) — vẫn chỉ
    // đăng ký 1 lần lúc mount như trước khi tách hook.
  }, [paragraphRefs, exempt]);

  if (exempt) return { penalty: NO_PENALTY, isPenaltyActive: false, warningMessage: null };
  return { penalty, isPenaltyActive, warningMessage };
}
