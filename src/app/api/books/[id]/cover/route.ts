import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import type { BookGenre } from "@/lib/supabase/types";
import { resolveBookCoverUrl } from "@/lib/covers/resolve-book-cover";
import { buildCoverSpec } from "@/lib/covers/build-cover-spec";
import { loadCoverFonts } from "@/lib/covers/fonts";
import { buildOgCoverElement, OG_HEIGHT, OG_WIDTH } from "@/components/covers/generated-book-cover-og";

/**
 * GET /api/books/:id/cover — dùng cho social share/OG image
 * (`og:image`/`twitter:image` của 1 trang chi tiết sách, khi được xây).
 * KHÔNG phải chỗ app tự hiện bìa trong UI — page dùng
 * src/components/covers/book-cover.tsx trực tiếp (render SVG ngay trong
 * JSX, không qua network round-trip nào). Route này chỉ tồn tại vì OG
 * image cần 1 URL fetch được, và ảnh PNG (không phải SVG) mới chắc chắn
 * hiện được trên mọi nền tảng share (Facebook/Slack/X không render SVG
 * og:image nhất quán).
 *
 * Chỉ trả PNG qua next/og's ImageResponse (Satori) — xem
 * generated-book-cover-og.tsx. Từng có nhánh trả SVG thô
 * (renderToStaticMarkup + component React) nhưng Next.js 16 chặn thẳng ở
 * build: "You're importing a component that imports react-dom/server" —
 * Route Handler không được phép vừa render 1 React component vừa import
 * react-dom/server kiểu đó. Không đáng đánh đổi (SVG thô chỉ là tiện ích
 * debug, đã có sẵn qua component trong app) để lách rule này.
 *
 * Không lưu lại PNG đã sinh ở đâu — render lại mỗi request, chỉ cache ở
 * tầng HTTP (Cache-Control) vì bìa placeholder có thể đổi ngay khi tác
 * giả gắn bìa thật, không muốn cache "quá lâu" tại đúng chỗ dễ đổi nhất.
 */
export const runtime = "nodejs"; // fonts.ts đọc file font qua fs, cần Node.js runtime, không chạy được ở Edge.

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=3600, s-maxage=86400",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, title, author_id, genre, cover_design_item_id")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    console.error("[covers] /api/books/[id]/cover: query books failed:", bookError);
  }
  if (!book) {
    // RLS đã lo phần "sách chưa published và không phải chủ sở hữu" —
    // maybeSingle() trả null cho cả 2 trường hợp "không tồn tại" và
    // "không có quyền xem", không phân biệt được (đúng ý, không để lộ
    // sách private nào đang tồn tại cho người lạ).
    return NextResponse.json({ error: "Không tìm thấy sách." }, { status: 404 });
  }

  const coverUrl = await resolveBookCoverUrl(supabase, book);
  if (coverUrl) {
    return NextResponse.redirect(coverUrl, 302);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", book.author_id)
    .maybeSingle();

  const spec = buildCoverSpec({
    id: book.id,
    title: book.title,
    author: profile?.nickname ?? null,
    genre: book.genre as BookGenre | null,
  });

  return new ImageResponse(buildOgCoverElement(spec), {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: loadCoverFonts(),
    headers: CACHE_HEADERS,
  });
}
