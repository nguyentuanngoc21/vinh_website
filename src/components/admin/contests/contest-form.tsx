"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Button, Checkbox, Field, Textarea } from "@/components/ui";
import { genres } from "@/lib/books";
import {
  DEFAULT_ELIGIBILITY_RULES,
  DEFAULT_VOTE_RULES,
  type EligibilityRules,
  type VoteRules,
} from "@/lib/contests/config";
import { isoToVnLocal, vnLocalToIso } from "@/lib/contests/datetime";
import type { Database } from "@/lib/supabase/types";

type ContestRow = Database["public"]["Tables"]["contests"]["Row"];
type Prize = { name: string; amount_vnd: string; extra: string };

const DATE_FIELDS = [
  ["submission_start", "Mở nhận bài", true],
  ["submission_end", "Đóng nhận bài", true],
  ["voting_start", "Mở bình chọn", false],
  ["voting_end", "Kết thúc bình chọn", false],
  ["judging_start", "Bắt đầu chấm", false],
  ["judging_end", "Kết thúc chấm", false],
  ["result_at", "Dự kiến công bố", false],
] as const;
type DateKey = (typeof DATE_FIELDS)[number][0];

const numOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));
const numText = (v: number | null) => (v === null ? "" : String(v));

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-3 mt-2">
      <h2 className="text-base font-bold text-brand-ink">{children}</h2>
      {note && <p className="mt-0.5 text-xs text-stone-alt">{note}</p>}
    </div>
  );
}

/**
 * Tạo / sửa cuộc thi. Khi cuộc thi đã rời bản nháp, thể lệ, slug, giải
 * thưởng và điều kiện bị khoá (Q5 — DB cũng từ chối) nên form chỉ gửi các
 * trường còn sửa được. Mọi mốc nhập theo giờ Việt Nam.
 */
export function ContestForm({ contest }: { contest: ContestRow | null }) {
  const router = useRouter();
  const locked = contest !== null && contest.status !== "draft";
  const eligibilityInit = { ...DEFAULT_ELIGIBILITY_RULES, ...(contest?.eligibility_rules as Partial<EligibilityRules> | undefined) };
  const voteInit = { ...DEFAULT_VOTE_RULES, ...(contest?.vote_rules as Partial<VoteRules> | undefined) };

  const [slug, setSlug] = useState(contest?.slug ?? "");
  const [title, setTitle] = useState(contest?.title ?? "");
  const [shortDescription, setShortDescription] = useState(contest?.short_description ?? "");
  const [description, setDescription] = useState(contest?.description ?? "");
  const [keyVisualUrl, setKeyVisualUrl] = useState(contest?.key_visual_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(contest?.banner_url ?? "");
  const [isFeatured, setIsFeatured] = useState(contest?.is_featured ?? false);
  const [dates, setDates] = useState<Record<DateKey, string>>(() =>
    Object.fromEntries(DATE_FIELDS.map(([k]) => [k, isoToVnLocal(contest?.[k] ?? null)])) as Record<DateKey, string>
  );
  const [rulesVersion, setRulesVersion] = useState(contest?.rules_version ?? "1");
  const [rulesContent, setRulesContent] = useState(contest?.rules_content ?? "");
  const [prizes, setPrizes] = useState<Prize[]>(() =>
    ((contest?.prizes_summary ?? []) as { name: string; amount_vnd: number; extra?: string }[]).map((p) => ({
      name: p.name,
      amount_vnd: String(p.amount_vnd),
      extra: p.extra ?? "",
    }))
  );
  const [rules, setRules] = useState<EligibilityRules>(eligibilityInit);
  const [vote, setVote] = useState<VoteRules>(voteInit);
  const [firstPublishedAfter, setFirstPublishedAfter] = useState(isoToVnLocal(eligibilityInit.first_published_after));
  const [requiredTags, setRequiredTags] = useState(eligibilityInit.required_tags.join(", "));

  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const setRule = <K extends keyof EligibilityRules>(key: K, value: EligibilityRules[K]) => setRules((r) => ({ ...r, [key]: value }));

  const toggleGenre = (label: string) =>
    setRule(
      "allowed_genres",
      (() => {
        const current = rules.allowed_genres ?? [];
        const next = current.includes(label) ? current.filter((g) => g !== label) : [...current, label];
        return next.length ? next : null;
      })()
    );

  const buildBody = (): { body: Record<string, unknown> } | { errors: string[] } => {
    const errs: string[] = [];
    const body: Record<string, unknown> = {
      title,
      short_description: shortDescription,
      description,
      key_visual_url: keyVisualUrl,
      banner_url: bannerUrl,
      is_featured: isFeatured,
    };
    for (const [key, label, required] of DATE_FIELDS) {
      const raw = dates[key];
      if (!raw) {
        if (required) errs.push(`${label}: bắt buộc`);
        body[key] = null;
        continue;
      }
      const iso = vnLocalToIso(raw);
      if (!iso) errs.push(`${label}: không hợp lệ`);
      body[key] = iso;
    }
    if (!locked) {
      body.slug = slug;
      body.rules_version = rulesVersion;
      body.rules_content = rulesContent;
      body.prizes_summary = prizes.map((p) => ({ name: p.name, amount_vnd: Number(p.amount_vnd), extra: p.extra }));
      const after = firstPublishedAfter ? vnLocalToIso(firstPublishedAfter) : null;
      if (firstPublishedAfter && !after) errs.push("Đăng lần đầu từ: không hợp lệ");
      body.eligibility_rules = {
        ...rules,
        first_published_after: after,
        required_tags: requiredTags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      body.vote_rules = vote;
    }
    return errs.length ? { errors: errs } : { body };
  };

  const submit = async () => {
    const built = buildBody();
    if ("errors" in built) {
      setErrors(built.errors);
      return;
    }
    setPending(true);
    setErrors([]);
    setSaved(false);
    const res = await fetch(contest ? `/api/admin/contests/${contest.id}` : "/api/admin/contests", {
      method: contest ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setErrors(Array.isArray(data?.details) ? data.details : [data?.error ?? "Không lưu được."]);
      return;
    }
    if (!contest) {
      router.push(`/admin/cuoc-thi/${data.contest.id}`);
      return;
    }
    setSaved(true);
    router.refresh();
  };

  const numberInput = (label: string, value: number | null, onChange: (v: number | null) => void, hint?: string) => (
    <Field
      label={label}
      hint={hint}
      type="number"
      min={0}
      inputMode="numeric"
      disabled={locked}
      value={numText(value)}
      onChange={(e) => onChange(numOrNull(e.target.value))}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {locked && (
        <Alert tone="info">
          Cuộc thi đã công khai: thể lệ, đường dẫn, giải thưởng và điều kiện dự thi đã khoá. Vẫn sửa được tên, mô tả, hình ảnh và các mốc thời gian.
        </Alert>
      )}

      <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
        <SectionTitle>Thông tin chung</SectionTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Tên cuộc thi" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <Field
            label="Đường dẫn (slug)"
            hint={`/cuoc-thi/${slug || "ten-cuoc-thi"}`}
            value={slug}
            disabled={locked}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            maxLength={80}
          />
          <Field label="Mô tả ngắn" wrapperClassName="md:col-span-2" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} maxLength={280} />
          <Textarea label="Giới thiệu" wrapperClassName="md:col-span-2" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          <Field label="Ảnh key visual (URL)" value={keyVisualUrl} onChange={(e) => setKeyVisualUrl(e.target.value)} />
          <Field label="Ảnh banner (URL)" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} />
        </div>
        <div className="mt-4">
          <Checkbox checked={isFeatured} onChange={() => setIsFeatured((v) => !v)}>
            Hiện ở vị trí nổi bật trên trang Cuộc thi
          </Checkbox>
        </div>
      </section>

      <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
        <SectionTitle note="Giờ Việt Nam (GMT+7).">Thời gian</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DATE_FIELDS.map(([key, label, required]) => (
            <Field
              key={key}
              label={required ? `${label} *` : label}
              type="datetime-local"
              value={dates[key]}
              onChange={(e) => setDates((d) => ({ ...d, [key]: e.target.value }))}
            />
          ))}
        </div>
      </section>

      <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
        <SectionTitle note="Thể lệ không đổi sau khi công khai — kiểm tra kỹ trước khi chuyển khỏi bản nháp.">Thể lệ & giải thưởng</SectionTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[160px_1fr]">
          <Field label="Phiên bản thể lệ" value={rulesVersion} disabled={locked} onChange={(e) => setRulesVersion(e.target.value)} maxLength={20} />
          <Textarea label="Nội dung thể lệ" rows={8} value={rulesContent} disabled={locked} onChange={(e) => setRulesContent(e.target.value)} />
        </div>
        <div className="mt-5 flex flex-col gap-3">
          <div className="text-[13px] font-semibold text-slate">Cơ cấu giải (VND — quy đổi token khi trao)</div>
          {prizes.map((p, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-[10px] border border-cream-border p-3 sm:grid-cols-[1fr_160px_1.4fr_auto] sm:items-end">
              <Field label="Tên giải" value={p.name} disabled={locked} onChange={(e) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Field label="Số tiền (VND)" type="number" min={0} inputMode="numeric" value={p.amount_vnd} disabled={locked}
                onChange={(e) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, amount_vnd: e.target.value } : x)))} />
              <Field label="Quà kèm" value={p.extra} disabled={locked} onChange={(e) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, extra: e.target.value } : x)))} />
              {!locked && (
                <button type="button" onClick={() => setPrizes((ps) => ps.filter((_, j) => j !== i))}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] border border-cream-border px-3 text-sm text-error" aria-label="Xoá giải">
                  <TrashIcon size={16} /> <span className="sm:hidden">Xoá giải</span>
                </button>
              )}
            </div>
          ))}
          {!locked && (
            <Button type="button" variant="ghost" fullWidth={false} className="self-start px-4 py-2.5 text-sm"
              onClick={() => setPrizes((ps) => [...ps, { name: "", amount_vnd: "0", extra: "" }])}>
              <PlusIcon size={15} weight="bold" /> Thêm giải
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
        <SectionTitle note="Kiểm tự động khi tác giả gửi bài. Truyện dự thi luôn phải miễn phí toàn bộ chương (D8).">Điều kiện dự thi</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {numberInput("Số chương tối thiểu", rules.min_published_chapters, (v) => setRule("min_published_chapters", v))}
          {numberInput("Số chữ tối thiểu", rules.min_words, (v) => setRule("min_words", v))}
          {numberInput("Số chữ tối đa", rules.max_words, (v) => setRule("max_words", v))}
          {numberInput("Tối đa tác phẩm / tác giả", rules.max_entries_per_author, (v) => setRule("max_entries_per_author", v), "Để trống = không giới hạn")}
          {numberInput("Tuổi tối thiểu của tác giả", rules.min_author_age, (v) => setRule("min_author_age", v), "Theo ngày sinh trong hồ sơ")}
          <Field label="Đăng lần đầu từ" type="datetime-local" disabled={locked} value={firstPublishedAfter} onChange={(e) => setFirstPublishedAfter(e.target.value)} />
          <Field label="Tag bắt buộc" hint="Cách nhau bằng dấu phẩy" wrapperClassName="sm:col-span-2 lg:col-span-3" disabled={locked}
            value={requiredTags} onChange={(e) => setRequiredTags(e.target.value)} />
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[13px] font-semibold text-slate">Thể loại được nhận {rules.allowed_genres ? "" : "(đang nhận mọi thể loại)"}</div>
          <div className="flex flex-wrap gap-2">
            {genres.map((g) => {
              const on = rules.allowed_genres?.includes(g.label) ?? false;
              return (
                <button key={g.slug} type="button" disabled={locked} onClick={() => toggleGenre(g.label)}
                  className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors disabled:opacity-60 ${on ? "bg-brand-ink text-white" : "bg-neutral-bg text-ink"}`}>
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        <fieldset disabled={locked} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Checkbox checked={rules.email_verified} onChange={() => !locked && setRule("email_verified", !rules.email_verified)}>Tác giả phải xác minh email</Checkbox>
          <Checkbox checked={rules.require_exclusive} onChange={() => !locked && setRule("require_exclusive", !rules.require_exclusive)}>
            Chỉ nhận truyện Độc quyền trên Vịnh (không tắt được độc quyền đến khi có kết quả)
          </Checkbox>
          <Checkbox checked={!rules.allow_multi_contest} onChange={() => !locked && setRule("allow_multi_contest", !rules.allow_multi_contest)}>
            Chỉ dự thi cuộc thi này (không đồng thời dự cuộc thi khác)
          </Checkbox>
          <Checkbox checked={rules.allow_resubmit_after_withdraw} onChange={() => !locked && setRule("allow_resubmit_after_withdraw", !rules.allow_resubmit_after_withdraw)}>
            Cho gửi lại sau khi rút bài
          </Checkbox>
          <Checkbox checked={rules.no_prior_entries} onChange={() => !locked && setRule("no_prior_entries", !rules.no_prior_entries)}>Chỉ nhận tác phẩm chưa từng dự thi</Checkbox>
          <Checkbox checked={rules.no_prior_awards} onChange={() => !locked && setRule("no_prior_awards", !rules.no_prior_awards)}>Chỉ nhận tác phẩm chưa từng đạt giải</Checkbox>
        </fieldset>
      </section>

      <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-[22px]">
        <SectionTitle note="Mỗi tài khoản 1 phiếu cho mỗi tác phẩm, không giới hạn số tác phẩm (D5).">Bình chọn</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tuổi tài khoản tối thiểu (ngày)" type="number" min={0} inputMode="numeric" disabled={locked}
            value={String(vote.min_account_age_days)} onChange={(e) => setVote((v) => ({ ...v, min_account_age_days: Number(e.target.value) || 0 }))} />
          <div className="flex items-center">
            <Checkbox checked={vote.require_completed_chapter} onChange={() => !locked && setVote((v) => ({ ...v, require_completed_chapter: !v.require_completed_chapter }))}>
              Phải đọc hết ít nhất 1 chương của tác phẩm
            </Checkbox>
          </div>
        </div>
      </section>

      {errors.length > 0 && (
        <Alert tone="error">
          <ul className="list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </Alert>
      )}
      {saved && <Alert tone="success">Đã lưu.</Alert>}

      <div className="sticky bottom-0 flex justify-end gap-3 rounded-[14px] border border-cream-border bg-white/95 p-3 backdrop-blur">
        <Button type="button" variant="dark" fullWidth={false} className="w-full px-6 sm:w-auto" disabled={pending} onClick={submit}>
          {pending ? "Đang lưu…" : contest ? "Lưu thay đổi" : "Tạo cuộc thi (bản nháp)"}
        </Button>
      </div>
    </div>
  );
}
