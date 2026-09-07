import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { UserDetailPanel, type UserDetail } from "@/components/admin/user-detail-panel";

export const metadata: Metadata = { title: "Chi tiết người dùng · Vịnh Admin" };

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const supabase = createServiceRoleClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, username, nickname, role, token_balance, token_balance_pending, cccd_verified, screenshot_penalty_banned, trust_orders_completed, trust_orders_cancelled_at_fault, trust_off_platform_flags, trust_violations_resolved, created_at"
    )
    .eq("id", userId)
    .maybeSingle();
  if (!profile) notFound();

  const [{ count: bookCount }, { count: audioCount }, { count: designCount }] = await Promise.all([
    supabase.from("books").select("id", { count: "exact", head: true }).eq("author_id", userId),
    supabase.from("audio_narrations").select("id", { count: "exact", head: true }).eq("narrator_id", userId),
    supabase.from("design_items").select("id", { count: "exact", head: true }).eq("illustrator_id", userId),
  ]);

  const detail: UserDetail = {
    id: profile.id,
    username: profile.username,
    nickname: profile.nickname,
    role: profile.role,
    tokenBalance: profile.token_balance,
    tokenBalancePending: profile.token_balance_pending,
    cccdVerified: profile.cccd_verified,
    screenshotPenaltyBanned: profile.screenshot_penalty_banned,
    trust: {
      ordersCompleted: profile.trust_orders_completed,
      ordersCancelledAtFault: profile.trust_orders_cancelled_at_fault,
      offPlatformFlags: profile.trust_off_platform_flags,
      violationsResolved: profile.trust_violations_resolved,
    },
    createdAt: profile.created_at,
    bookCount: bookCount ?? 0,
    audioCount: audioCount ?? 0,
    designCount: designCount ?? 0,
  };

  return (
    <>
      <Link
        href="/admin/nguoi-dung"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-stone-alt no-underline hover:text-brand-ink"
      >
        <CaretLeftIcon size={14} /> Người dùng
      </Link>
      <UserDetailPanel user={detail} />
    </>
  );
}
