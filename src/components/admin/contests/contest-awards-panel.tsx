"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Button, Field } from "@/components/ui";
import { vndToTokens } from "@/lib/contests/admin-input";
import type { AdminAward, AdminSubmission } from "@/lib/contests/admin-service";
import type { ContestStatus } from "@/lib/supabase/types";

const AWARDABLE: ContestStatus[] = ["submission_closed", "community_voting", "judging", "results"];
const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/**
 * Trao giải (D10): nhập VND, server quy đổi token theo tỷ giá hiện hành và
 * lưu cả tỷ giá. Chi trả vào ví là bước thủ công riêng (Slice 1.7). Giải chỉ
 * công khai sau khi công bố kết quả; sau đó chỉ thu hồi được, không xoá.
 */
export function ContestAwardsPanel({
  contestId,
  status,
  resultsVisible,
  awards,
  candidates,
}: {
  contestId: string;
  status: ContestStatus;
  resultsVisible: boolean;
  awards: AdminAward[];
  /** Bài hợp lệ / vào vòng trong — bài được trao giải. */
  candidates: Pick<AdminSubmission, "id" | "book_title" | "author_name">[];
}) {
  const router = useRouter();
  const [submissionId, setSubmissionId] = useState(candidates[0]?.id ?? "");
  const [code, setCode] = useState("first_prize");
  const [name, setName] = useState("Giải Nhất");
  const [rank, setRank] = useState("1");
  const [category, setCategory] = useState("");
  const [prizeVnd, setPrizeVnd] = useState("0");
  const [extras, setExtras] = useState("");
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAward = AWARDABLE.includes(status);

  const request = async (url: string, method: string, body?: unknown) => {
    setPending(true);
    setError(null);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? {} : await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(Array.isArray(data?.details) ? data.details.join("; ") : (data?.error ?? "Không thực hiện được."));
      return false;
    }
    router.refresh();
    return true;
  };

  const create = () =>
    request(`/api/admin/contests/${contestId}/awards`, "POST", {
      submission_id: submissionId,
      award_code: code.trim(),
      award_name: name.trim(),
      award_rank: rank.trim() ? Number(rank) : null,
      category: category.trim() || null,
      prize_vnd: Number(prizeVnd) || 0,
      prize_extras: extras.trim() || null,
    });

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
        <h2 className="mb-3 text-base font-bold text-brand-ink">Giải đã trao</h2>
        {!resultsVisible && awards.length > 0 && (
          <div className="mb-3"><Alert tone="info">Kết quả chưa công bố — người dùng chưa thấy các giải này.</Alert></div>
        )}
        {awards.length === 0 ? (
          <p className="text-sm text-stone-alt">Chưa trao giải nào.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {awards.map((a) => (
              <div key={a.id} className="flex flex-col gap-3 rounded-[12px] border border-cream-border p-4 sm:flex-row sm:items-center">
                <TrophyIcon size={22} weight="fill" className="hidden shrink-0 text-brand-gold sm:block" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    {a.award_name}
                    {a.award_rank !== null && <span className="text-xs font-normal text-stone-alt">hạng {a.award_rank}</span>}
                    {a.revoked_at && <span className="rounded-full bg-error-bg px-2 py-0.5 text-[11px] text-error">Đã thu hồi</span>}
                    {a.paid_at && <span className="rounded-full bg-success-form-border px-2 py-0.5 text-[11px] text-success-form">Đã chi trả</span>}
                  </div>
                  <div className="text-xs text-stone-alt">{a.book_title} · {a.author_name}</div>
                  <div className="text-xs text-stone-dark">
                    {vnd(a.prize_vnd)} → {a.prize_tokens.toLocaleString("vi-VN")} token
                    {a.token_vnd_rate ? ` (tỷ giá ${a.token_vnd_rate}đ/token)` : ""}
                    {a.prize_extras ? ` · ${a.prize_extras}` : ""}
                  </div>
                  {a.revoked_reason && <div className="text-xs text-error">Lý do thu hồi: {a.revoked_reason}</div>}
                </div>
                {!a.revoked_at && (
                  <div className="flex shrink-0 gap-2">
                    {!resultsVisible && !a.paid_at && status !== "archived" ? (
                      <Button type="button" variant="ghost" fullWidth={false} className="px-4 py-2 text-xs" disabled={pending}
                        onClick={() => request(`/api/admin/contests/${contestId}/awards/${a.id}`, "DELETE")}>Xoá</Button>
                    ) : (
                      <Button type="button" variant="ghost" fullWidth={false} className="px-4 py-2 text-xs" onClick={() => setRevokeId(a.id)}>Thu hồi</Button>
                    )}
                  </div>
                )}
                {revokeId === a.id && (
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
                    <Field label="Lý do thu hồi (hiển thị ở trang lưu trữ)" wrapperClassName="flex-1" value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)} maxLength={500} />
                    <Button type="button" variant="dark" fullWidth={false} className="px-4 py-3 text-sm" disabled={pending || !revokeReason.trim()}
                      onClick={async () => {
                        if (await request(`/api/admin/contests/${contestId}/awards/${a.id}`, "PATCH", { revoke: true, reason: revokeReason.trim() })) {
                          setRevokeId(null);
                          setRevokeReason("");
                        }
                      }}>Xác nhận thu hồi</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
        <h2 className="mb-1 text-base font-bold text-brand-ink">Trao giải</h2>
        {!canAward ? (
          <p className="text-sm text-stone-alt">Trao giải được từ khi đóng nhận bài đến khi công bố kết quả.</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-stone-alt">Chưa có bài hợp lệ nào.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <div className="mb-[7px] text-[13px] font-semibold text-slate">Tác phẩm</div>
              <select value={submissionId} onChange={(e) => setSubmissionId(e.target.value)}
                className="w-full rounded-[10px] border border-border-light bg-white px-[15px] py-3 text-[14.5px] text-ink focus:border-brand-ink focus:outline-none">
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.book_title} — {c.author_name}</option>)}
              </select>
            </label>
            <Field label="Tên giải" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <Field label="Mã giải" hint="Chữ thường, số, gạch dưới — vd first_prize, readers_choice" value={code} onChange={(e) => setCode(e.target.value)} />
            <Field label="Hạng (để trống nếu không xếp hạng)" type="number" min={1} inputMode="numeric" value={rank} onChange={(e) => setRank(e.target.value)} />
            <Field label="Hạng mục" value={category} onChange={(e) => setCategory(e.target.value)} />
            <Field label="Giải thưởng (VND)" type="number" min={0} inputMode="numeric" value={prizeVnd}
              hint={`≈ ${vndToTokens(Number(prizeVnd) || 0).toLocaleString("vi-VN")} token theo tỷ giá hiện hành`}
              onChange={(e) => setPrizeVnd(e.target.value)} />
            <Field label="Quà kèm" value={extras} placeholder="vd: Hợp đồng xuất bản" onChange={(e) => setExtras(e.target.value)} />
            <div className="sm:col-span-2">
              <Button type="button" variant="dark" fullWidth={false} className="w-full px-6 sm:w-auto" disabled={pending || !submissionId} onClick={create}>
                Trao giải
              </Button>
            </div>
          </div>
        )}
      </section>

      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
