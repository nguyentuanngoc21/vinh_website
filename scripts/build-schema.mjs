// Ghép các file baseline theo domain (migrations/baseline/NN_*.sql, theo thứ
// tự tên file) thành docs/supabase/schema.sql — bản toàn cảnh 1 file để đọc/
// grep/review. Nguồn sự thật là migrations/baseline/, KHÔNG phải schema.sql.
//
//   node scripts/build-schema.mjs          # ghi lại docs/supabase/schema.sql
//   node scripts/build-schema.mjs --check  # exit 1 nếu schema.sql chưa khớp
//
// --check so sánh bỏ qua khác biệt CRLF/LF (Windows checkout với
// core.autocrlf) để không báo lệch giả.
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineDir = path.join(root, "migrations", "baseline");
const target = path.join(root, "docs", "supabase", "schema.sql");

const HEADER = `-- =======================================================================
-- docs/supabase/schema.sql — FILE SINH TỰ ĐỘNG. ĐỪNG sửa tay — sửa file
-- trong migrations/baseline/ rồi chạy \`npm run build-schema\`.
--
-- Ghép nguyên văn migrations/baseline/*.sql theo thứ tự tên file (mỗi file
-- 1 domain, có header riêng liệt kê đối tượng + phụ thuộc). Chạy từ trên
-- xuống trên 1 project Supabase MỚI, TRỐNG sẽ dựng lại toàn bộ schema +
-- seed data. KHÔNG chạy trên production — xem migrations/baseline/README.md.
-- =======================================================================
`;

const toLf = (s) => s.replace(/\r\n/g, "\n");

async function build() {
  const files = (await readdir(baselineDir))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  if (files.length === 0) throw new Error(`Không thấy file .sql nào trong ${baselineDir}`);
  const parts = [HEADER];
  for (const f of files) {
    const body = toLf(await readFile(path.join(baselineDir, f), "utf8")).replace(/\n*$/, "\n");
    parts.push(`\n-- >>>>>>>>>>>>>>>>>>>>>>>>>>>> migrations/baseline/${f} <<<<<<<<<<<<<<<<<<<<<<<<<<<<\n\n${body}`);
  }
  return { text: parts.join(""), files };
}

const { text, files } = await build();
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = toLf(await readFile(target, "utf8"));
  } catch {
    // thiếu file = lệch
  }
  if (current !== text) {
    console.error("docs/supabase/schema.sql KHÔNG khớp migrations/baseline/ — chạy `npm run build-schema`.");
    process.exit(1);
  }
  console.log(`docs/supabase/schema.sql khớp ${files.length} file baseline.`);
} else {
  await writeFile(target, text, "utf8");
  console.log(`Đã ghi docs/supabase/schema.sql từ ${files.length} file baseline.`);
}
