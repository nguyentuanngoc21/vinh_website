import type { Metadata } from "next";
import { Suspense } from "react";
import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { ConnectDirectory, type ConnectPerson } from "@/components/connect/connect-directory";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { resolveBookCoverUrl } from "@/lib/covers/resolve-book-cover";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Kết nối — Vịnh",
};

// Trang directory chưa phân trang — 60 người mới tham gia gần nhất là đủ
// dùng ở quy mô nền tảng hiện tại (thêm phân trang/tìm kiếm server-side
// sau nếu số user thật vượt xa mốc này).
const PEOPLE_LIMIT = 60;

function formatJoined(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return h > 0 ? `${h} giờ ${remM} phút` : `${remM} phút`;
}

/**
 * "Kết nối" — trước đây 100% mock (src/lib/connect-directory.ts). Giờ
 * đọc author_public_profiles (đã mở rộng thêm bio/created_at, xem
 * migrations/20260828_extend_author_public_profiles.sql) làm danh sách
 * người dùng thật, author_follows làm follow count/trạng thái theo dõi
 * thật, và 3 nguồn nội dung thật đã có sẵn trong schema nhưng CHƯA từng
 * được list theo tác giả ở đâu cả: books (Truyện chữ),
 * public_audio_narrations (Audio), public_design_items (Design). Mục
 * "Blog" bị bỏ hẳn khỏi UI — không có bảng blog nào trong schema, hiện
 * số liệu giả cho mục này sẽ sai với chính yêu cầu "số liệu chính xác".
 *
 * Dùng service-role vì cần thấy public info + follow count của MỌI
 * người dùng (không chỉ hàng của viewer) — RLS của profiles/author_follows
 * chỉ cho chủ hàng tự xem, giống lý do api/profile/me và api/follows
 * cũng phải dùng service-role.
 */
export default async function ConnectPage() {
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);

  const { data: profileRows, error: profilesError } = await supabase
    .from("author_public_profiles")
    .select("id, username, nickname, avatar_url, cover_image_url, bio, created_at, creator_tags")
    .order("created_at", { ascending: false })
    .limit(PEOPLE_LIMIT);
  if (profilesError) {
    // Lỗi phổ biến nhất ở đây: chưa chạy
    // migrations/20260828_extend_author_public_profiles.sql (view cũ
    // chưa có cột bio/created_at) — select lỗi, data về null, trang vẫn
    // render bình thường nhưng hiện "Chưa có người dùng nào" dù profiles
    // rõ ràng có dữ liệu. Log ra để không im lặng nuốt lỗi như vậy nữa.
    console.error("[ket-noi] author_public_profiles query failed:", profilesError);
  }
  const people = profileRows ?? [];
  const peopleIds = people.map((p) => p.id);

  const [
    { data: followRows, error: followError },
    { data: bookRows, error: bookError },
    { data: audioRows, error: audioError },
    { data: designRows, error: designError },
    { data: serviceRows, error: serviceError },
    { data: nameAgreementRows, error: nameAgreementError },
  ] =
    peopleIds.length === 0
      ? [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ]
      : await Promise.all([
          supabase.from("author_follows").select("follower_id, author_id").in("author_id", peopleIds),
          supabase
            .from("books")
            .select("id, title, slug, genre, author_id, cover_design_item_id, created_at, is_ghostwritten")
            .in("author_id", peopleIds)
            .eq("published", true)
            .is("deleted_at", null)
            .order("created_at", { ascending: false }),
          supabase
            .from("public_audio_narrations")
            .select("id, narrator_id, title, audio_url, duration_seconds, created_at")
            .in("narrator_id", peopleIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("public_design_items")
            .select("id, illustrator_id, title, image_url, created_at")
            .in("illustrator_id", peopleIds)
            .order("created_at", { ascending: false }),
          // Chỉ thẻ gig ĐANG nhận đơn (đủ 11/11 trường, xem
          // src/lib/orders/service-listing-service.ts) — listing chưa đủ
          // điều kiện không lộ ra ở Kết nối dù không riêng tư.
          supabase
            .from("service_listings")
            .select("id, seller_id, service_type, name, price_tiers, delivery_days")
            .in("seller_id", peopleIds)
            .eq("is_accepting_orders", true)
            .eq("is_private", false),
          // Ẩn 2 chiều (yêu cầu bổ sung #2): truyện viết thuê chỉ lộ ra ở
          // list "Truyện chữ" của ghostwriter nếu ghostwriter_sample_visible,
          // và chỉ lộ dưới hồ sơ CUSTOMER nếu customer_profile_visible —
          // xem migrations/20260901_add_ghostwriting_authorship.sql.
          supabase
            .from("author_name_agreements")
            .select("book_id, ghostwriter_id, customer_id, ghostwriter_sample_visible, customer_profile_visible")
            .or(`ghostwriter_id.in.(${peopleIds.join(",")}),customer_id.in.(${peopleIds.join(",")})`),
        ]);
  if (followError) console.error("[ket-noi] author_follows query failed:", followError);
  if (bookError) console.error("[ket-noi] books query failed:", bookError);
  if (audioError) console.error("[ket-noi] public_audio_narrations query failed:", audioError);
  if (designError) console.error("[ket-noi] public_design_items query failed:", designError);
  if (serviceError) console.error("[ket-noi] service_listings query failed:", serviceError);
  if (nameAgreementError) console.error("[ket-noi] author_name_agreements query failed:", nameAgreementError);

  const followerCountById = new Map<string, number>();
  const followingByViewer = new Set<string>();
  for (const row of followRows ?? []) {
    followerCountById.set(row.author_id, (followerCountById.get(row.author_id) ?? 0) + 1);
    if (viewerId && row.follower_id === viewerId) followingByViewer.add(row.author_id);
  }

  const bookCoverUrls = await Promise.all((bookRows ?? []).map((b) => resolveBookCoverUrl(supabase, b)));
  const nameAgreementByBook = new Map((nameAgreementRows ?? []).map((r) => [r.book_id, r]));
  const booksByAuthor = new Map<string, ConnectPerson["works"]["truyen"]>();
  const pushBook = (personId: string, item: ConnectPerson["works"]["truyen"][number]) => {
    const list = booksByAuthor.get(personId) ?? [];
    list.push(item);
    booksByAuthor.set(personId, list);
  };
  (bookRows ?? []).forEach((b, i) => {
    const item = {
      id: b.id,
      title: b.title,
      meta: b.genre ?? "Truyện chữ",
      date: formatShortDate(b.created_at),
      href: `/truyen/${b.slug}`,
      imageUrl: bookCoverUrls[i],
    };
    if (!b.is_ghostwritten) {
      pushBook(b.author_id, item);
      return;
    }
    // Truyện viết thuê — MẶC ĐỊNH ẨN ở cả 2 phía, chỉ lộ ra đúng phía đã
    // được đồng ý qua thỏa thuận đứng tên (yêu cầu bổ sung #2).
    const agreement = nameAgreementByBook.get(b.id);
    if (agreement?.ghostwriter_sample_visible) pushBook(b.author_id, item);
    if (agreement?.customer_profile_visible) pushBook(agreement.customer_id, item);
  });

  const audioByAuthor = new Map<string, ConnectPerson["works"]["audio"]>();
  for (const a of audioRows ?? []) {
    const list = audioByAuthor.get(a.narrator_id) ?? [];
    const { data: urlData } = supabase.storage.from("audio-narrations").getPublicUrl(a.audio_url);
    list.push({
      id: a.id,
      title: a.title,
      meta: formatDuration(a.duration_seconds) || "Audio",
      date: formatShortDate(a.created_at),
      href: null,
      imageUrl: null,
      audioUrl: urlData.publicUrl,
    });
    audioByAuthor.set(a.narrator_id, list);
  }

  const designByAuthor = new Map<string, ConnectPerson["works"]["design"]>();
  for (const d of designRows ?? []) {
    const list = designByAuthor.get(d.illustrator_id) ?? [];
    const { data: urlData } = supabase.storage.from("design-images").getPublicUrl(d.image_url);
    list.push({
      id: d.id,
      title: d.title,
      meta: "Thiết kế",
      date: formatShortDate(d.created_at),
      href: null,
      imageUrl: urlData.publicUrl,
    });
    designByAuthor.set(d.illustrator_id, list);
  }

  const servicesBySeller = new Map<string, ConnectPerson["services"]>();
  for (const s of serviceRows ?? []) {
    const list = servicesBySeller.get(s.seller_id) ?? [];
    const tiers = Array.isArray(s.price_tiers) ? s.price_tiers : [];
    const prices = tiers.map((t) => Number((t as { price?: unknown })?.price)).filter((n) => Number.isFinite(n) && n > 0);
    list.push({
      id: s.id,
      serviceType: s.service_type,
      name: s.name,
      minPrice: prices.length ? Math.min(...prices) : null,
      deliveryDays: s.delivery_days,
    });
    servicesBySeller.set(s.seller_id, list);
  }

  const connectPeople: ConnectPerson[] = people.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    username: p.username,
    avatarUrl: p.avatar_url,
    coverImageUrl: p.cover_image_url,
    bio: p.bio,
    joined: formatJoined(p.created_at),
    creatorTags: p.creator_tags,
    followerCount: followerCountById.get(p.id) ?? 0,
    isFollowingByViewer: followingByViewer.has(p.id),
    services: servicesBySeller.get(p.id) ?? [],
    works: {
      truyen: booksByAuthor.get(p.id) ?? [],
      audio: audioByAuthor.get(p.id) ?? [],
      design: designByAuthor.get(p.id) ?? [],
    },
  }));

  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader showSearch={false} />
        <main>
          <Suspense fallback={null}>
            <ConnectDirectory people={connectPeople} viewerId={viewerId} />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
