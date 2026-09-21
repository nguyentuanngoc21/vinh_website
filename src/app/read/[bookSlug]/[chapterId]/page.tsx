import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Reader } from "@/components/reading/reader";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId, getAuthedAdminId } from "@/lib/wallet/session";
import { getChapterAudio } from "@/lib/audio/get-chapter-audio";
import { buildContentPreview } from "@/lib/reading/access-gate";
import { extractDesignShareLinkId } from "@/lib/design/share-link";

export async function generateMetadata({
  params,
}: PageProps<"/read/[bookSlug]/[chapterId]">): Promise<Metadata> {
  const { chapterId } = await params;
  const supabase = await createClient();
  const { data: chapter } = await supabase.from("chapters").select("title").eq("id", chapterId).maybeSingle();

  return {
    title: chapter ? `${chapter.title} — Vịnh` : "Đọc truyện — Vịnh",
    // "noai, noimageai" không nằm trong bộ directive chuẩn Next.js biết
    // (field `robots` ở trên chỉ hỗ trợ index/follow/...), nên phải phát
    // qua `other` — vẫn ra đúng thẻ <meta name="robots" content="noai,
    // noimageai">, chỉ là 1 thẻ robots thứ 2 tách biệt. Xem
    // src/app/robots.ts (robots.txt) — đây là lớp khai báo thứ 2 cho
    // cùng mục đích, không phải cơ chế chặn kỹ thuật thật (như đã ghi ở
    // src/lib/orders/xmp.ts cho ảnh/audio).
    other: { robots: "noai, noimageai" },
  };
}

export default async function ReadChapterPage({
  params,
}: PageProps<"/read/[bookSlug]/[chapterId]">) {
  const { bookSlug, chapterId } = await params;
  const supabase = await createClient();
  const serviceClient = createServiceRoleClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, slug, title, synopsis, author_id, published")
    .eq("slug", bookSlug)
    .maybeSingle();
  if (!book || !book.published) notFound();

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, content, order_index, published, price")
    .eq("id", chapterId)
    .eq("book_id", book.id)
    .maybeSingle();
  if (!chapter || !chapter.published) notFound();

  // getAuthedUserId() thử cả session cookie tự ký VÀ Supabase Auth thật
  // (src/lib/wallet/session.ts) — nhất quán với các route khác trong repo
  // (penalty, wallet), thay vì chỉ supabase.auth.getUser(). Resolve 1 lần,
  // dùng lại cho cả render (vote/follow đã có chưa) và after() (book_progress).
  const [{ data: authorProfile }, { data: siblings }, { data: voteCountRow }, viewerId, linkedAudio, adminId] =
    await Promise.all([
      supabase.from("author_public_profiles").select("nickname, avatar_url").eq("id", book.author_id).maybeSingle(),
      // Lấy luôn `title` — dùng chung cho tính prev/next VÀ danh sách chọn
      // chương (ChapterPicker), không thêm 1 query riêng cho việc đó.
      supabase
        .from("chapters")
        .select("id, title, order_index")
        .eq("book_id", book.id)
        .eq("published", true)
        .order("order_index", { ascending: true }),
      supabase.from("chapter_vote_counts").select("vote_count").eq("chapter_id", chapter.id).maybeSingle(),
      getAuthedUserId(serviceClient),
      getChapterAudio(supabase, chapter.id),
      // Cho nút "Xóa" (kiểm duyệt) ở AuthorPanel — null nếu chưa đăng nhập
      // hoặc không phải admin/super_admin, ẩn nút hoàn toàn khi đó.
      getAuthedAdminId(serviceClient),
    ]);

  const ordered = siblings ?? [];
  const idx = ordered.findIndex((c) => c.id === chapter.id);
  const prevChapterId = idx > 0 ? ordered[idx - 1].id : null;
  const nextChapterId = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1].id : null;
  // Vị trí hiển thị 1-based trong danh sách chương published — không dùng
  // order_index thô (có thể có khoảng trống/không bắt đầu từ 1).
  const chapterPosition = idx >= 0 ? idx + 1 : 1;

  const isOwnBook = viewerId !== null && viewerId === book.author_id;

  // Chỉ query khi đã đăng nhập — 3 bảng này chỉ có ý nghĩa với 1 viewer cụ
  // thể. purchase_transactions chỉ cần tra khi chương thật sự có giá — hầu
  // hết chương free, tra thêm 1 query vô ích cho mọi lượt đọc là phí.
  const needsPurchaseLookup = viewerId !== null && chapter.price > 0 && !isOwnBook;
  const [{ data: votedRow }, { data: followRow }, { data: purchaseRow }, { data: progressRow }, { data: myTropeVote }] =
    viewerId
      ? await Promise.all([
          serviceClient.from("chapter_votes").select("chapter_id").eq("chapter_id", chapter.id).eq("user_id", viewerId).maybeSingle(),
          serviceClient.from("author_follows").select("author_id").eq("author_id", book.author_id).eq("follower_id", viewerId).maybeSingle(),
          needsPurchaseLookup
            ? serviceClient.from("purchase_transactions").select("id").eq("chapter_id", chapter.id).eq("buyer_id", viewerId).maybeSingle()
            : Promise.resolve({ data: null }),
          // Tự cuộn tới đúng đoạn đã đọc dở — CHỈ áp dụng nếu chapter_id đã
          // lưu khớp đúng chương đang mở (mở chương khác, kể cả cùng sách,
          // thì bắt đầu từ đầu). Xem
          // migrations/20260910_add_book_progress_paragraph.sql.
          serviceClient
            .from("book_progress")
            .select("chapter_id, last_paragraph_index")
            .eq("user_id", viewerId)
            .eq("book_id", book.id)
            .maybeSingle(),
          serviceClient.from("character_trope_votes").select("character_id").eq("user_id", viewerId).eq("chapter_id", chapter.id).maybeSingle(),
        ])
      : [{ data: null }, { data: null }, { data: null }, { data: null }, { data: null }];

  // Nhân vật gắn với CHƯƠNG NÀY — cho panel "Bình chọn mẫu hình nhân vật"
  // (reader_vote_trope). Rỗng thì Reader tự ẩn panel, không bịa dữ liệu.
  // 2 bước (không dùng embed characters(...)) — tránh phụ thuộc
  // Relationships của generated types (xem cách achievement-service.ts đã
  // làm cho reading_history/books).
  const { data: chapterCharacterRows } = await supabase
    .from("chapter_characters")
    .select("character_id")
    .eq("chapter_id", chapter.id);
  const taggedCharacterIds = (chapterCharacterRows ?? []).map((r) => r.character_id);
  const { data: tropeCandidateRows } = taggedCharacterIds.length
    ? await supabase.from("characters").select("id, name, role, trope").in("id", taggedCharacterIds)
    : { data: [] as { id: string; name: string; role: "hero" | "villain" | "neutral"; trope: string | null }[] };
  const tropeCandidates = tropeCandidateRows ?? [];

  const initialParagraphIndex =
    progressRow && progressRow.chapter_id === chapter.id ? progressRow.last_paragraph_index : null;

  // Rào truy nghiệm — vá lỗ hổng cũ (chapters.price tồn tại nhưng chưa hề
  // được đọc ở trang này, ai cũng đọc được full mọi chương kể cả VIP chưa
  // mua) + thêm giới hạn cho khách vãng lai (xem src/lib/reading/access-gate.ts):
  // - Tác giả xem chương của chính mình: luôn full, bỏ qua mọi rào.
  // - Chương giá > 0 (VIP) mà viewer chưa mua (hoặc chưa đăng nhập nên
  //   chắc chắn chưa mua): chặn HOÀN TOÀN, không có preview % — khác chương
  //   thường, xem quyết định ở PR/thảo luận tính năng này.
  // - Chương thường (price = 0) mà khách CHƯA đăng nhập: chỉ thấy
  //   GUEST_PREVIEW_RATIO đầu, phần còn lại yêu cầu đăng nhập (miễn phí).
  // - Mọi trường hợp khác (đã đăng nhập, hoặc đã mua): full, accessGate="none".
  const isPurchased = !!purchaseRow;
  const needsPurchase = !isOwnBook && chapter.price > 0 && !isPurchased;
  let content = chapter.content;
  let accessGate: "none" | "login" | "purchase" = "none";
  if (needsPurchase) {
    content = "";
    accessGate = "purchase";
  } else if (viewerId === null && !isOwnBook) {
    const preview = buildContentPreview(chapter.content);
    if (preview.truncated) {
      content = preview.visible;
      accessGate = "login";
    }
  }

  // Ảnh thiết kế chèn inline — chapters.content chỉ giữ marker
  // `[[thiet-ke:<designItemId>]]`, KHÔNG BAO GIỜ share_token gốc (xem
  // chapter-editor.tsx "Chèn ảnh thiết kế" — token chỉ xác thực 1 lần lúc
  // dán). Resolve id → ảnh ở đây (server, qua view public_design_items —
  // không cần token để ĐỌC, chỉ cần để CHÈN) rồi truyền map xuống Reader,
  // để component đọc (client) không phải tự gọi thêm request nào. Quét
  // trên `content` CUỐI CÙNG (sau rào truy nghiệm/preview ở trên), không
  // phải chapter.content thô — marker nằm ngoài phần được phép xem thì
  // không cần resolve.
  // Marker `[[thiet-ke:<id>]]` (chèn qua nút "Chèn ảnh thiết kế") CỘNG
  // link chia sẻ thô dán thẳng vào 1 đoạn riêng (chưa/không qua nút đó —
  // xem chapter-editor.tsx và extractDesignShareLinkId) — cả 2 đều resolve
  // ra ảnh giống nhau ở đây, reader.tsx tự nhận đúng dạng nào khi render.
  const markerIds = [...content.matchAll(/\[\[thiet-ke:([0-9a-f-]{36})\]\]/g)].map((m) => m[1]);
  const rawLinkIds = content
    .split("\n\n")
    .map((p) => extractDesignShareLinkId(p.trim()))
    .filter((id): id is string => id !== null);
  const designImageIds = [...new Set([...markerIds, ...rawLinkIds])];
  const { data: designImageRows } = designImageIds.length
    ? await supabase.from("public_design_items").select("id, image_url, alt_text, title").in("id", designImageIds)
    : { data: [] as { id: string; image_url: string; alt_text: string | null; title: string }[] };
  const designImages = Object.fromEntries(
    (designImageRows ?? []).map((row) => [
      row.id,
      {
        imageUrl: supabase.storage.from("design-images").getPublicUrl(row.image_url).data.publicUrl,
        altText: row.alt_text ?? row.title,
      },
    ])
  );

  // Side effect: tăng view + ghi "chương đọc gần nhất" — chạy SAU khi
  // response đã trả về (không cộng latency vào lần tải trang), nhưng vẫn
  // đảm bảo chạy xong (khác fire-and-forget thuần, có rủi ro bị runtime
  // serverless tắt giữa chừng). Đây là lần đầu dùng after() trong repo —
  // đã smoke-test rằng vẫn chạy đúng bên trong callback.
  after(async () => {
    const { error: viewError } = await supabase.rpc("increment_book_view_count", { p_book_id: book.id });
    if (viewError) console.error("[read] increment_book_view_count failed:", viewError);

    if (viewerId) {
      const { error: progressError } = await serviceClient
        .from("book_progress")
        .upsert(
          { user_id: viewerId, book_id: book.id, chapter_id: chapter.id },
          { onConflict: "user_id,book_id" }
        );
      if (progressError) console.error("[read] upsert book_progress failed:", progressError);
    }
  });

  return (
    <Reader
      bookSlug={book.slug}
      bookId={book.id}
      bookTitle={book.title}
      bookSynopsis={book.synopsis}
      authorId={book.author_id}
      authorName={authorProfile?.nickname ?? "Ẩn danh"}
      authorAvatarUrl={authorProfile?.avatar_url ?? null}
      isOwnBook={isOwnBook}
      showFollowButton={!isOwnBook && viewerId !== null}
      isFollowingAuthor={!!followRow}
      chapterId={chapter.id}
      chapterTitle={chapter.title}
      chapterPosition={chapterPosition}
      content={content}
      designImages={designImages}
      prevChapterId={prevChapterId}
      nextChapterId={nextChapterId}
      chapters={ordered.map((c, i) => ({ id: c.id, title: c.title, position: i + 1 }))}
      initialVoted={!!votedRow}
      initialVoteCount={voteCountRow?.vote_count ?? 0}
      linkedAudio={linkedAudio}
      viewerIsAdmin={!!adminId}
      accessGate={accessGate}
      chapterPrice={chapter.price}
      isLoggedIn={viewerId !== null}
      initialParagraphIndex={initialParagraphIndex}
      tropeCandidates={tropeCandidates}
      initialTropeVoteCharacterId={myTropeVote?.character_id ?? null}
    />
  );
}
