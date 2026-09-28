"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Button, Field } from "@/components/ui";
import { vndToTokens } from "@/lib/contests/admin-input";
import type { AdminAward, AdminSubmission } from "@/lib/contests/admin-service";
import type { AwardProposal } from "@/lib/contests/final-scoring-service";
import type { ContestStatus } from "@/lib/supabase/types";

const AWARDABLE: ContestStatus[] = ["submission_closed", "community_voting", "judging", "results"];
const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/**
 * Trao giải (D10): nhập VND, server quy đổi token theo tỷ giá hiện hành và
 * lưu cả tỷ giá. Chi trả vào ví là bước thủ công riêng (nút "Chi trả", sau khi công bố kết quả). Giải chỉ
 * công khai sau khi công bố kết quả; sau đó chỉ thu hồi được, không xoá.
 */
export function ContestAwardsPanel({
  contestId,
  status,
  resultsVisible,
  awards,
  candidates,
  proposals = [],
}: {
  contestId: string;
  status: ContestStatus;
  resultsVisible: boolean;
  awards: AdminAward[];
  /** Bài hợp lệ / vào vòng trong — bài được trao giải. */
  candidates: Pick<AdminSubmission, "id" | "book_title" | "author_name">[];
  /** J10: giải đề xuất từ lượt tính đang công bố — admin xác nhận từng giải. */
  proposals?: AwardProposal[];
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
      {proposals.length > 0 && (
        <ProposalsSection proposals={proposals} canAward={canAward} pending={pending}
          onConfirm={(p, prize) =>
            request(`/api/admin/contests/${contestId}/awards`, "POST", {
              submission_id: p.submission_id,
              award_code: p.code,
              award_name: p.name,
              award_rank: p.kind === "main" ? p.rank : null,
              category: p.kind === "main" ? "Giải chính" : "Giải đặc biệt",
              prize_vnd: prize,
              prize_extras: p.prize_extras,
            })
          } />
      )}
      {error && proposals.length > 0 && <Alert tone="error">{error}</Alert>}
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
                    {resultsVisible && !a.paid_at && a.prize_tokens > 0 && (
                      <Button type="button" variant="dark" fullWidth={false} className="px-4 py-2 text-xs" disabled={pending}
                        onClick={() => {
                          if (window.confirm(`Chi ${a.prize_tokens.toLocaleString("vi-VN")} token vào ví của ${a.author_name}? Không hoàn tác được.`)) {
                            void request(`/api/admin/contests/${contestId}/awards/${a.id}/pay`, "POST");
                          }
                        }}>
                        Chi trả
                      </Button>
                    )}
                    {!resultsVisible && !a.paid_at && status !== "archived" ? (
                      <Button type="button" variant="ghost" fullWidth={false} className="px-4 py-2 text-xs" disabled={pending}
                        onClick={() => request(`/api/admin/contests/${contestId}/awards/${a.id}`, "DELETE")}>Xoá</Button>
                    ) : (
                      <Button type="button" variant="ghost" fullWidth={false} className="px-4 py-2 text-xs" onClick={() => setRevokeId(a.id)}>Thu hồi</Button>
                    )}
                  </div>
                )}
                {revokeId === a.id && a.paid_at && (
                  // Quyết định sau chạy thử (28/09): thu hồi không tự trừ token đã chi trả.
                  <div className="w-full">
                    <Alert tone="error">
                      Giải này đã chi trả {a.prize_tokens.toLocaleString("vi-VN")} token. Thu hồi không tự trừ lại token — nếu cần,
                      admin điều chỉnh ví của tác giả bằng tay.
                    </Alert>
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

function ProposalsSection({
  proposals,
  canAward,
  pending,
  onConfirm,
}: {
  proposals: AwardProposal[];
  canAward: boolean;
  pending: boolean;
  onConfirm: (p: AwardProposal, prizeVnd: number) => Promise<boolean>;
}) {
  const [prizes, setPrizes] = useState<Record<string, string>>(() =>
    Object.fromEntries(proposals.map((p) => [`${p.code}:${p.submission_id}`, String(p.prize_vnd)]))
  );
  return (
    <section className="rounded-[14px] border border-cream-gold-border bg-cream-card p-4 sm:p-[22px]">
      <h2 className="text-base font-bold text-brand-ink">Đề xuất từ kết quả chấm đã công bố</h2>
      <p className="mt-1 text-xs leading-relaxed text-stone-dark">
        Hệ thống xếp giải theo lượt tính đang công bố (J9). Kiểm tra số tiền (lấy theo tên giải trong thể lệ) rồi xác nhận từng giải —
        giải chỉ thành thật sau khi xác nhận; chi trả vẫn là bước riêng.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {proposals.map((p) => {
          const key = `${p.code}:${p.submission_id}`;
          return (
            <div key={key} className="flex flex-col gap-2 rounded-[12px] border border-cream-border bg-white p-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">
                  {p.name} <span className="text-xs font-normal text-stone-alt">· hạng chung cuộc {p.rank}</span>
                </div>
                <div className="truncate text-xs text-stone-alt">{p.book_title} · {p.author_name}{p.prize_extras ? ` · ${p.prize_extras}` : ""}</div>
              </div>
              {p.confirmed ? (
                <span className="self-start rounded-full bg-success-form-bg px-2.5 py-1 text-[11px] font-semibold text-success-form sm:self-auto">Đã xác nhận</span>
              ) : (
                <div className="flex items-end gap-2">
                  <Field label="Tiền thưởng (VND)" type="number" min={0} step={1000} wrapperClassName="w-[150px]" value={prizes[key] ?? "0"}
                    disabled={!canAward} onChange={(e) => setPrizes((prev) => ({ ...prev, [key]: e.target.value }))} />
                  <Button type="button" variant="dark" fullWidth={false} className="px-4 py-3 text-xs" disabled={pending || !canAward}
                    onClick={() => void onConfirm(p, Math.max(0, Math.trunc(Number(prizes[key]) || 0)))}>
                    Xác nhận
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
