"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShareNetworkIcon, LockSimpleIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { Field, Alert } from "@/components/ui";

export type ManuscriptGrant = { username: string; nickname: string; grantedAt: string };

type ShareManuscriptPanelProps = {
  bookId: string;
  finalized: boolean;
  initialGrant: ManuscriptGrant | null;
};

/**
 * "Share bản thảo" kiểu Drive (yêu cầu bổ sung #1) — đúng 1 tài khoản,
 * gỡ/share lại được cho tới khi bấm "Hoàn thiện" (khóa vĩnh viễn, không
 * hỏi lại lần 2 vì không đảo ngược được — window.confirm đủ nghiêm trọng
 * ở đây, không cần modal riêng).
 */
export function ShareManuscriptPanel({ bookId, finalized: initialFinalized, initialGrant }: ShareManuscriptPanelProps) {
  const router = useRouter();
  const [grant, setGrant] = useState(initialGrant);
  const [finalized, setFinalized] = useState(initialFinalized);
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    if (!username.trim() || pending) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/authoring/books/${bookId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim() }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không share được.");
      return;
    }
    setGrant({ username: username.trim().replace(/^@/, ""), nickname: username.trim(), grantedAt: data.grant.granted_at });
    setUsername("");
    router.refresh();
  };

  const revoke = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/authoring/books/${bookId}/share`, { method: "DELETE" });
    setPending(false);
    if (!res.ok) {
      setError("Không gỡ được share.");
      return;
    }
    setGrant(null);
    router.refresh();
  };

  const finalize = async () => {
    if (pending || finalized) return;
    if (!window.confirm('Hoàn thiện truyện này? Sau khi Hoàn thiện, không thể gỡ/share lại bản thảo cho tài khoản khác — không đảo ngược được.')) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/authoring/books/${bookId}/finalize`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không hoàn thiện được.");
      return;
    }
    setFinalized(true);
    router.refresh();
  };

  return (
    <div className="mb-6 rounded-[12px] border border-cream-border bg-white p-5">
      <div className="flex items-center gap-2 text-[14.5px] font-bold text-brand-ink">
        <ShareNetworkIcon size={18} /> Chia sẻ bản thảo
      </div>
      <div className="mt-1 text-[13px] text-stone-alt">
        Cấp quyền xem cho đúng 1 tài khoản — gỡ ra rồi share lại người khác được, tới khi bạn bấm &quot;Hoàn thiện&quot;.
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-3.5">
        {grant ? (
          <div className="flex items-center justify-between gap-3 rounded-[9px] border border-cream-border bg-cream-card px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold text-ink">@{grant.username}</div>
              <div className="mt-0.5 text-xs text-stone">
                Từ {new Date(grant.grantedAt).toLocaleDateString("vi-VN")}
                {finalized ? " · Đã khóa (Hoàn thiện)" : ""}
              </div>
            </div>
            {!finalized && (
              <button
                type="button"
                onClick={revoke}
                disabled={pending}
                className="flex shrink-0 items-center gap-1 rounded-full border border-[#f3c6c6] px-3 py-1.5 text-xs font-semibold text-[#B02A37] disabled:opacity-60"
              >
                <XIcon size={13} /> Gỡ share
              </button>
            )}
          </div>
        ) : finalized ? (
          <div className="text-[13px] text-stone-light">Chưa từng share — đã Hoàn thiện, không thể share nữa.</div>
        ) : (
          <div className="flex gap-2">
            <Field
              label={null}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@tên tài khoản cần share"
              className="flex-1"
            />
            <button
              type="button"
              onClick={share}
              disabled={pending || !username.trim()}
              className="shrink-0 rounded-[10px] bg-brand-gold px-4 py-2 text-[13.5px] font-bold text-brand-ink disabled:cursor-default disabled:opacity-60"
            >
              Share
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-[#F2ECE0] pt-3.5">
        <button
          type="button"
          onClick={finalize}
          disabled={pending || finalized}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-ink disabled:cursor-default disabled:text-stone-light"
        >
          <LockSimpleIcon size={15} weight={finalized ? "fill" : "regular"} />
          {finalized ? "Đã Hoàn thiện — khóa vĩnh viễn" : "Hoàn thiện (khóa share vĩnh viễn)"}
        </button>
      </div>
    </div>
  );
}
