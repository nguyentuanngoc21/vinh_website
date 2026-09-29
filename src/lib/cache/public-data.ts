import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { revalidateTag, unstable_cache } from "next/cache";
import type { Database } from "@/lib/supabase/types";
import { getHomepageData } from "@/lib/home/get-homepage-books";
import { getAudioCatalog, getTopAudioTrack } from "@/lib/audio/get-audio-catalog";
import { getBookRankings } from "@/lib/rankings/get-book-rankings";
import { getBooksByGenre } from "@/lib/search/get-books-by-genre";
import type { BookGenre } from "@/lib/supabase/types";

/**
 * Cache dữ liệu CÔNG KHAI (giống hệt nhau với mọi người xem) của các trang
 * đông khách nhất: trang chủ, /rankings, /truyen, /audio. Trước đây mỗi
 * request chạy lại toàn bộ query Supabase.
 *
 * Dùng `unstable_cache` (repo chưa bật `cacheComponents` — xem
 * node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md).
 * Hàm được cache KHÔNG được gọi cookies()/headers(), nên dùng 1 client
 * anon không session: kết quả đúng bằng thứ khách chưa đăng nhập vẫn thấy
 * qua RLS. Phần phụ thuộc người xem (gợi ý, tiến độ nghe, nút theo dõi…)
 * KHÔNG đi qua đây. Không cache gallery thiết kế — nó ký signed URL có hạn.
 *
 * Làm mới: tự hết hạn sau PUBLIC_REVALIDATE_SECONDS, và bị đánh dấu cũ ngay
 * khi route ghi dữ liệu gọi revalidatePublicBooks()/revalidatePublicAudio()
 * (stale-while-revalidate, profile "max").
 */

const PUBLIC_REVALIDATE_SECONDS = 300;

export const PUBLIC_CACHE_TAGS = {
  books: "public-books",
  audio: "public-audio",
} as const;

function createPublicClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export const getCachedHomepageData = unstable_cache(
  () => getHomepageData(createPublicClient()),
  ["public-homepage-data"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [PUBLIC_CACHE_TAGS.books] }
);

export const getCachedTopAudioTrack = unstable_cache(
  () => getTopAudioTrack(createPublicClient()),
  ["public-top-audio-track"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [PUBLIC_CACHE_TAGS.audio] }
);

export const getCachedAudioCatalog = unstable_cache(
  () => getAudioCatalog(createPublicClient()),
  ["public-audio-catalog"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [PUBLIC_CACHE_TAGS.audio] }
);

// Lượt đọc tuần/tháng/quý thay đổi liên tục — trễ tối đa 5 phút là chấp
// nhận được cho bảng xếp hạng.
export const getCachedBookRankings = unstable_cache(
  () => getBookRankings(createPublicClient()),
  ["public-book-rankings"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [PUBLIC_CACHE_TAGS.books] }
);

// Tham số `genre` tự thành một phần của cache key (mỗi thể loại 1 entry).
export const getCachedBooksByGenre = unstable_cache(
  (genre: BookGenre | null) => getBooksByGenre(createPublicClient(), genre),
  ["public-books-by-genre"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: [PUBLIC_CACHE_TAGS.books] }
);

/** Gọi sau mọi thay đổi có thể hiện ra ở thẻ truyện công khai: đăng/gỡ/xoá
 * sách hoặc chương, đổi tiêu đề/thể loại/tóm tắt/bìa, kiểm duyệt, đổi
 * nickname tác giả. */
export function revalidatePublicBooks(): void {
  revalidateTag(PUBLIC_CACHE_TAGS.books, "max");
}

/** Gọi sau khi thêm/sửa/xoá bản audio hoặc đổi thông tin người đọc. */
export function revalidatePublicAudio(): void {
  revalidateTag(PUBLIC_CACHE_TAGS.audio, "max");
}
