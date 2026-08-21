// Script tay kiểm tra luồng viết truyện (src/lib/authoring/slugify.ts +
// migrations/20260819_add_book_genre.sql + 20260820_add_chapter_price.sql)
// — theo đúng convention scripts/test_*.mjs khác trong repo.
//
// Chạy: npx tsx scripts/test_authoring_flow.mjs

import fs from "fs";
import path from "path";
import { slugifyTitle } from "../src/lib/authoring/slugify.ts";

function loadEnv(file) {
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    process.env[key] = val;
  }
}

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) loadEnv(envPath);

let failed = 0;
function check(label, condition) {
  console.log(condition ? `  ✓ ${label}` : `  ✗ ${label}`);
  if (!condition) failed++;
}

console.log("1. slugifyTitle");
const slugA = slugifyTitle("Vũng Vịnh Cuối Trời");
const slugB = slugifyTitle("Vũng Vịnh Cuối Trời");
check(`2 lần gọi cùng title ra 2 slug khác nhau (${slugA} / ${slugB})`, slugA !== slugB);
check("slug chỉ gồm a-z0-9- (bỏ hết dấu tiếng Việt)", /^[a-z0-9-]+$/.test(slugA));
check("title toàn ký tự đặc biệt/rỗng vẫn ra slug hợp lệ", /^[a-z0-9-]+$/.test(slugifyTitle("!!!")));

console.log("\n2. Round-trip với Supabase thật (nếu có .env.local + đã chạy đủ 2 migration)");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log("  (bỏ qua — thiếu NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY trong .env.local)");
} else {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (profileError || !profile) {
    console.log("  (bỏ qua — không có profile nào trong DB để dùng làm author_id test)");
  } else {
    const title = `Test Authoring Flow ${Date.now()}`;
    const { data: book, error: bookError } = await supabase
      .from("books")
      .insert({ author_id: profile.id, title, slug: slugifyTitle(title), genre: "Kỳ ảo" })
      .select("id, genre")
      .single();

    if (bookError?.code === "42703") {
      console.log("  (bỏ qua — cột books.genre chưa tồn tại, chạy migrations/20260819_add_book_genre.sql trước)");
    } else if (bookError || !book) {
      check("tạo book test", false);
      console.error(bookError);
    } else {
      check("tạo book test thành công, genre lưu đúng", book.genre === "Kỳ ảo");

      const { data: chapter, error: chapterError } = await supabase
        .from("chapters")
        .insert({ book_id: book.id, title: "Chương 1", content: "", order_index: 1 })
        .select("id, price, is_exclusive")
        .single();

      if (chapterError?.code === "42703") {
        console.log(
          "  (bỏ qua — cột chapters.price/is_exclusive chưa tồn tại, chạy migrations/20260820_add_chapter_price.sql trước)"
        );
      } else if (chapterError || !chapter) {
        check("tạo chapter test", false);
        console.error(chapterError);
      } else {
        check("chapter mới mặc định price = 0", chapter.price === 0);
        check("chapter mới mặc định is_exclusive = true", chapter.is_exclusive === true);

        const { data: updated, error: updateError } = await supabase
          .from("chapters")
          .update({ price: 5000, is_exclusive: false, published: true })
          .eq("id", chapter.id)
          .select("price, is_exclusive, published")
          .single();

        check(
          "cập nhật price/is_exclusive/published (giống PATCH /api/authoring/chapters/:id) thành công",
          !updateError && updated?.price === 5000 && updated?.is_exclusive === false && updated?.published === true
        );
      }

      // Dọn dẹp — xoá book test, chapters tự cascade theo
      // "on delete cascade" (docs/supabase/schema.sql).
      await supabase.from("books").delete().eq("id", book.id);
      console.log("  (đã xoá book/chapter test)");
    }
  }
}

console.log(failed === 0 ? "\nTất cả kiểm tra PASS." : `\n${failed} kiểm tra FAIL.`);
process.exitCode = failed === 0 ? 0 : 1;
