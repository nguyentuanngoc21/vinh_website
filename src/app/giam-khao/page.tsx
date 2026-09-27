import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GavelIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { CONTEST_STATUS_LABEL } from "@/lib/contests/labels";
import { listJudgeContests } from "@/lib/contests/judging-service";

export const metadata: Metadata = { title: "Chấm giải — Vịnh", robots: { index: false } };

/**
 * Màn chấm của giám khảo (Slice 2.5b): các cuộc thi người xem được gán chấm.
 * proxy.ts chỉ gác đăng nhập; quyền giám khảo kiểm ở judging-service.
 */
export default async function JudgeHomePage() {
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);
  if (!viewerId) redirect("/dang-nhap?next=/giam-khao");
  const contests = await listJudgeContests(supabase, viewerId);

  return (
    <div className="flex-1 bg-neutral-bg">
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader />
        <main className="px-4 pb-12 pt-7 sm:px-8 lg:px-11">
          <h1 className="flex items-center gap-2 text-[24px] font-bold text-brand-ink sm:text-[26px]"><GavelIcon size={24} /> Chấm giải</h1>
          <p className="mt-1 text-sm text-stone-alt">Các cuộc thi bạn được mời làm giám khảo. Bài chấm là bản chụp lúc đóng nhận bài, không hiện tên tác giả.</p>
          {contests.length === 0 ? (
            <div className="mt-6 rounded-[14px] border border-dashed border-cream-border p-6 text-sm text-stone-alt">Bạn chưa được gán chấm cuộc thi nào.</div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {contests.map((c) => (
                <Link key={c.slug} href={`/giam-khao/${c.slug}`} className="flex flex-col gap-1.5 rounded-[14px] border border-cream-border p-4 no-underline">
                  <div className="text-base font-bold text-brand-ink">{c.title}</div>
                  <div className="text-xs text-stone-alt">{CONTEST_STATUS_LABEL[c.status]}</div>
                  <div className="text-[13px] font-semibold text-brand-gold-dark">Đã chốt {c.finalized}/{c.entries} bài →</div>
                </Link>
              ))}
            </div>
          )}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
