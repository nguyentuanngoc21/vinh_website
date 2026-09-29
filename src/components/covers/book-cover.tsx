import type { BookGenre } from "@/lib/supabase/types";
import { buildCoverSpec } from "@/lib/covers/build-cover-spec";
import { GeneratedBookCover } from "./generated-book-cover";

export type BookCoverProps = {
  // Seed cho biến thể (hash deterministic) — dùng book id THẬT khi có
  // (uuid ổn định); component vẫn nhận string bất kỳ để chỗ còn dùng mock
  // data (chưa có id thật, xem book-coverflow.tsx) vẫn dùng được, seed
  // bằng title cũng ổn định như nhau.
  id: string;
  title: string;
  author?: string | null;
  genre: BookGenre | null;
  // null/undefined = chưa gắn bìa thật -> sinh bìa tự động. Component
  // này KHÔNG tự query Supabase — nơi gọi (Server Component/route) tự
  // resolve qua resolveBookCoverUrl() (src/lib/covers/resolve-book-cover.ts)
  // rồi truyền xuống, để component này dùng lại được cả ở nơi chỉ có mock
  // data (không có gì để resolve).
  coverUrl?: string | null;
  className?: string;
  // true cho bìa nằm trong màn hình đầu tiên (ảnh LCP, vd bìa đang active ở
  // carousel trang chủ) — tải ngay với độ ưu tiên cao thay vì lazy. Mặc
  // định false: mọi bìa khác (lưới, danh sách dài, nhất là trên mobile)
  // chỉ tải khi sắp cuộn tới. Chỉ ảnh hưởng bìa ảnh thật, không ảnh hưởng
  // bìa sinh tự động (SVG inline).
  priority?: boolean;
};

export function BookCover({ id, title, author, genre, coverUrl, className, priority = false }: BookCoverProps) {
  if (coverUrl) {
    return (
      // Ảnh tới từ bucket Supabase Storage của người dùng (project ref
      // khác nhau giữa dev/production, xem docs/SUPABASE_SETUP.md) —
      // không đưa wildcard domain Supabase vào next.config.ts
      // remotePatterns chỉ để dùng next/image cho 1 chỗ này.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt={title}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        className={className}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }

  const spec = buildCoverSpec({ id, title, author, genre });
  return <GeneratedBookCover spec={spec} className={className} />;
}
