"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircleIcon, CheckSquareIcon } from "@phosphor-icons/react/dist/ssr";
import type { EntryVote } from "@/lib/contests/feeds";

/** Lý do không bình chọn được — cùng mã với cast_contest_vote() / getEntryVoteState(). */
const REASON_TEXT: Record<string, string> = {
  not_logged_in: "Đăng nhập để bình chọn",
  voting_not_open: "Bình chọn chưa mở",
  voting_closed: "Bình chọn đã kết thúc",
  account_too_new: "Tài khoản chưa đủ ngày tuổi để bình chọn",
  entry_not_votable: "Tác phẩm không nhận bình chọn",
  own_entry: "Tác phẩm của bạn",
  no_completed_chapter: "Đọc hết 1 chương để bình chọn",
};

/**
 * Nút bình chọn cho 1 bài (D5). Server đã tính sẵn can_vote/lý do; bấm thì
 * gọi API, DB kiểm lại toàn bộ. Số phiếu không hiển thị ở đây (Q3).
 */
export function VoteButton({
  slug,
  submissionId,
  initial,
  fullWidth = false,
}: {
  slug: string;
  submissionId: string;
  initial: EntryVote;
  fullWidth?: boolean;
}) {
  const pathname = usePathname();
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/contests/${slug}/submissions/${submissionId}/vote`, { method: state.has_voted ? "DELETE" : "POST" });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(data?.error ?? "Không bình chọn được.");
      return;
    }
    setState((s) => ({ ...s, has_voted: data.has_voted, can_vote: !data.has_voted, can_retract: data.has_voted }));
  };

  const width = fullWidth ? "w-full justify-center" : "";
  const base = `mt-2.5 inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold ${width}`;

  if (state.reason === "not_logged_in") {
    return (
      <Link href={`/dang-nhap?next=${encodeURIComponent(pathname)}`} className={`${base} border border-border-light text-brand-ink no-underline`}>
        <CheckSquareIcon size={15} weight="bold" /> Bình chọn
      </Link>
    );
  }

  if (state.has_voted) {
    return (
      <div className="flex flex-col">
        <button type="button" disabled={!state.can_retract || pending} onClick={toggle}
          title={state.can_retract ? "Bấm để bỏ phiếu" : undefined}
          className={`${base} bg-brand-ink text-brand-gold-light disabled:cursor-default`}>
          <CheckCircleIcon size={15} weight="fill" /> Đã bình chọn
        </button>
        {error && <span className="mt-1 text-[11.5px] text-error">{error}</span>}
      </div>
    );
  }

  if (!state.can_vote) {
    return (
      <span className={`${base} cursor-not-allowed border border-border-light text-stone-light`}>
        {state.reason ? (REASON_TEXT[state.reason] ?? "Chưa bình chọn được") : "Chưa bình chọn được"}
      </span>
    );
  }

  return (
    <div className="flex flex-col">
      <button type="button" disabled={pending} onClick={toggle}
        className={`${base} border border-border-light bg-white text-brand-ink transition-colors hover:border-brand-ink disabled:opacity-60`}>
        <CheckSquareIcon size={15} weight="bold" /> Bình chọn
      </button>
      {error && <span className="mt-1 text-[11.5px] text-error">{error}</span>}
    </div>
  );
}
