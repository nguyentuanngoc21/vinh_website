// Script tay kiểm tra hệ thống sinh bìa tự động (src/lib/covers/*) — theo
// đúng convention scripts/test_*.mjs khác trong repo (không có test
// framework, chạy tay, kết nối Supabase qua .env.local khi cần).
//
// Import trực tiếp file .ts dưới src/lib/covers (không qua build) — cần
// chạy bằng tsx (đã cài devDependency), KHÔNG chạy bằng `node` thường:
// resolver ESM gốc của Node đòi path tương đối phải có đuôi file rõ ràng
// (./hash.ts, không phải ./hash), còn các file trong src/lib/covers viết
// theo style extensionless như phần còn lại của repo (khớp cách
// Next.js/tsc resolve, không phải cách Node tự chạy .ts trực tiếp).
//
// Chạy: npx tsx scripts/test_book_covers.mjs

import fs from "fs";
import path from "path";
import { buildCoverSpec } from "../src/lib/covers/build-cover-spec.ts";
import { GENRE_STYLES } from "../src/lib/covers/genre-styles.ts";

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

// ---------------------------------------------------------------------
// 1. Chuỗi test dấu tiếng Việt theo đúng prompt gốc — phải render không
//    lỗi, giữ nguyên toàn bộ dấu (không có glyph nào bị thay/mất khi
//    qua toLocaleUpperCase("vi") ở text-fit.ts, không tràn dòng).
// ---------------------------------------------------------------------
console.log("\n1. Chuỗi test dấu tiếng Việt");
const DIACRITIC_TEST_STRING =
  'Ăn Uống Đầy Đủ Ở Ngoài Vườn Nhà, Cô Ấy Nói: "Chuyện Này Không Dễ!"';
for (const genre of Object.keys(GENRE_STYLES)) {
  const spec = buildCoverSpec({
    id: `diacritic-${genre}`,
    title: DIACRITIC_TEST_STRING,
    author: "Tác giả Thử Nghiệm",
    genre,
  });
  const rejoined = spec.title.lines.join(" ");
  // So khớp không phân biệt hoa/thường (uppercase layout đổi case) —
  // kiểm tra không MẤT ký tự nào, không kiểm tra y nguyên case.
  const sameLength = rejoined.replace(/\s+/g, "") .length ===
    (spec.uppercase ? DIACRITIC_TEST_STRING.toLocaleUpperCase("vi") : DIACRITIC_TEST_STRING)
      .replace(/\s+/g, "").length;
  check(`${genre}: không mất ký tự, ${spec.title.lines.length} dòng, fontSize ${Math.round(spec.title.fontSize)}px`, sameLength);
}

// ---------------------------------------------------------------------
// 2. Title dài (85-90 ký tự, có dấu cách thật, giống tên truyện dài thực
//    tế) — không tràn/crash, chấp nhận nhiều dòng hơn maxLines nếu cần
//    nhưng KHÔNG BAO GIỜ throw hoặc treo.
// ---------------------------------------------------------------------
console.log("\n2. Title rất dài");
const LONG_TITLE =
  "Chuyện Kể Về Một Vùng Vịnh Xa Xôi Nơi Những Con Sóng Không Bao Giờ Ngừng Vỗ Về Bến Bờ Quê Hương";
check(`${LONG_TITLE.length} ký tự`, LONG_TITLE.length >= 85 && LONG_TITLE.length <= 95);
for (const genre of [...Object.keys(GENRE_STYLES), null]) {
  try {
    const spec = buildCoverSpec({ id: `long-${genre}`, title: LONG_TITLE, author: null, genre });
    check(
      `${genre ?? "(null)"}: ${spec.title.lines.length} dòng, fontSize ${Math.round(spec.title.fontSize)}px, không throw`,
      spec.title.lines.length > 0 && spec.title.fontSize > 0
    );
  } catch (err) {
    check(`${genre ?? "(null)"}: không throw`, false);
    console.error(err);
  }
}

// ---------------------------------------------------------------------
// 3. Hash deterministic — cùng book id, gọi lại nhiều lần phải ra cùng
//    palette/layout/rotation (không Math.random() ở đâu).
// ---------------------------------------------------------------------
console.log("\n3. Hash deterministic (ổn định qua nhiều lần gọi)");
const STABLE_ID = "00000000-0000-4000-8000-000000000001";
const runs = Array.from({ length: 5 }, () =>
  buildCoverSpec({ id: STABLE_ID, title: "Sách Ổn Định", author: "X", genre: "Kỳ ảo" })
);
const serialized = runs.map((r) => JSON.stringify({ palette: r.palette, layout: r.layout, rotationDeg: r.rotationDeg }));
check("5 lần gọi cùng id → cùng kết quả", serialized.every((s) => s === serialized[0]));

// Seed khác nhau → không phải lúc nào cũng ra cùng 1 palette (kiểm tra
// hash thực sự phân bố, không phải luôn trả về phần tử đầu tiên).
const variedIds = Array.from({ length: 20 }, (_, i) => `varied-${i}`);
const paletteChoices = new Set(
  variedIds.map((id) => JSON.stringify(buildCoverSpec({ id, title: "T", author: null, genre: "Kỳ ảo" }).palette))
);
check(`20 id khác nhau chọn ra >1 palette (thực tế: ${paletteChoices.size}/3)`, paletteChoices.size > 1);

// ---------------------------------------------------------------------
// 4. Round-trip với dữ liệu Supabase thật (nếu có) — không bắt buộc, chỉ
//    thông báo nếu chưa có sách nào (migration mới, chưa từng seed data).
// ---------------------------------------------------------------------
console.log("\n4. Round-trip với Supabase thật (nếu có sách)");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("  (bỏ qua — thiếu NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY trong .env.local)");
} else {
  const { createClient } = await import("@supabase/supabase-js");
  const { resolveBookCoverUrl } = await import("../src/lib/covers/resolve-book-cover.ts");
  const supabase = createClient(url, key);

  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, author_id, genre, cover_design_item_id")
    .limit(5);

  if (error?.code === "42703") {
    // Cột genre chưa tồn tại — migrations/20260819_add_book_genre.sql
    // chưa được chạy trên project này. Không phải lỗi code, chỉ là
    // chưa migrate — không tính là FAIL.
    console.log("  (bỏ qua — cột books.genre chưa tồn tại, chạy migrations/20260819_add_book_genre.sql trước)");
  } else if (error) {
    check("query books", false);
    console.error(error);
  } else if (!books || books.length === 0) {
    console.log("  (chưa có sách nào trong DB — chạy migrations/20260819_add_book_genre.sql rồi tạo thử 1 book để test đầy đủ)");
  } else {
    for (const book of books) {
      const coverUrl = await resolveBookCoverUrl(supabase, book);
      const spec = coverUrl ? null : buildCoverSpec({ id: book.id, title: book.title, author: null, genre: book.genre });
      console.log(
        `  ${book.title} (genre=${book.genre ?? "null"}) → ${coverUrl ? `bìa thật: ${coverUrl}` : `sinh tự động: ${spec.effect}/${spec.font}`}`
      );
    }
    check("round-trip không throw", true);
  }
}

console.log(failed === 0 ? "\nTất cả kiểm tra PASS." : `\n${failed} kiểm tra FAIL.`);
// process.exitCode (không phải process.exit()) — để Node tự thoát sau khi
// dọn xong các handle async còn treo (Supabase client dùng fetch/keep-alive
// ở phần 4) thay vì cắt ngang, tránh crash "UV_HANDLE_CLOSING" trên Windows.
process.exitCode = failed === 0 ? 0 : 1;
