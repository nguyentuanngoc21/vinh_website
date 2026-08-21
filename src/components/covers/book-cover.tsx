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
};

export function BookCover({ id, title, author, genre, coverUrl, className }: BookCoverProps) {
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
        className={className}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }

  const spec = buildCoverSpec({ id, title, author, genre });
  return <GeneratedBookCover spec={spec} className={className} />;
}
