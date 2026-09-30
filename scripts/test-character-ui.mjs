// Browser smoke test of real components with mocked HTTP responses and Next Link.
// Usage: node scripts/test-character-ui.mjs <path-to-playwright/index.mjs>
// Uses installed Microsoft Edge. No app credentials or remote DB involved.
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

if (!process.argv[2]) throw new Error("Pass the path to playwright/index.mjs");
const { chromium } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const profile = { id: "00000000-0000-4000-8000-000000000002", name: "An Nhiên", role: "hero", trope: null,
  archived_at: null, is_public: true, show_role: false, story_role: "main", aliases: "An", avatar_url: null, description: "Người kể chuyện", private_notes: "Ghi chú bí mật", created_at: new Date().toISOString() };
const OLD = new Date(Date.now() - 20 * 60 * 1000).toISOString();
// 1x1 PNG for the upload → crop → signed-URL flow.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client';
  import { CharacterManager } from './src/components/author/character-manager';
  import { ChapterCharactersPanel } from './src/components/author/chapter-characters-panel';
  import { CharacterList } from './src/components/story/character-list';
  const profile = ${JSON.stringify(profile)};
  createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-4xl p-4">
    <CharacterManager bookId="book" initialCharacters={[profile]} />
    <section aria-label="Gắn vào chương"><ChapterCharactersPanel bookId="book" chapterId="chapter" bookCharacters={[profile]} initialTaggedCharacterIds={[profile.id]} /></section>
    <section aria-label="Độc giả"><CharacterList characters={[{...profile, role:null, followedByViewer:false}]} /></section>
  </main>);
`;
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: "character-test.tsx", loader: "tsx" },
  bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "test-adapters", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: 'import React from "react"; export default function Link({href,children,...props}) {return React.createElement("a",{href,...props},children)}', resolveDir: process.cwd() }));
    // Storage upload is recorded instead of hitting Supabase.
    builder.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: "supabase", namespace: "test-supabase" }));
    builder.onLoad({ filter: /.*/, namespace: "test-supabase" }, () => ({ contents: 'export function createClient() { return { storage: { from: bucket => ({ uploadToSignedUrl: async (path, token, file) => { window.__uploads = [...(window.__uploads || []), { bucket, path, token, type: file.type }]; return { error: null }; } }) } }; }' }));
    builder.onResolve({ filter: /^@\/components\/ui$/ }, () => ({ path: "ui", namespace: "test-ui" }));
    builder.onLoad({ filter: /.*/, namespace: "test-ui" }, () => ({ contents: 'export { Field } from "./src/components/ui/field"; export { Textarea } from "./src/components/ui/textarea";', resolveDir: process.cwd() }));
  } }],
});
const cssFiles = (await readdir(".next/static/chunks")).filter(f => f.endsWith(".css"));
const css = (await Promise.all(cssFiles.map(f => readFile(path.join(".next/static/chunks", f), "utf8")))).join("\n");
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); }
  else if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
  else { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end('<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>'); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", dialog => dialog.accept());
  let stored = { ...profile }; let conflict = true; let created; let deleted = false;
  await page.route("**/api/**", async route => {
    const req = route.request(); const url = req.url(); const body = req.postDataJSON();
    let status = 200; let data;
    if (url.endsWith("/follow")) { status = 401; data = { error: "Vui lòng đăng nhập để theo dõi." }; }
    else if (req.method() === "PUT") {
      assert.ok(Array.isArray(body.expectedCharacterIds));
      if (conflict) { conflict = false; status = 409; data = { error: "Danh sách đã thay đổi ở nơi khác.", characterIds: [] }; }
      else data = { characterIds: body.characterIds };
    } else if (req.method() === "GET") data = { chapters: [{ id: "ch", title: "Chương đầu", order_index: 1, published: false }] };
    else if (url.endsWith("/characters/avatar")) data = { path: "author/character-book-1.jpg", token: "t", publicUrl: "https://cdn.test/avatars/author/character-book-1.jpg" };
    else if (req.method() === "DELETE") { assert.ok(url.endsWith(`/${profile.id}/permanent`)); deleted = true; data = { ok: true }; }
    else if (req.method() === "POST") { created = body; data = { character: { ...profile, ...body, id: "new", archived_at: null, created_at: OLD } }; }
    else { stored = { ...stored, ...body, ...(body.archived === undefined ? {} : { archived_at: body.archived ? new Date().toISOString() : null }) }; data = { character: stored }; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const manager = page.getByRole("region", { name: "Quản lý nhân vật" });
  await manager.getByRole("button", { name: "Thêm nhân vật", exact: true }).click();
  assert.equal(await manager.getByRole("checkbox", { name: "Công khai", exact: false }).isChecked(), false);
  await manager.getByLabel(/^Tên nhân vật/).fill("An Nhiên");
  await manager.getByText("Đã có nhân vật cùng tên", { exact: false }).waitFor();
  await manager.getByLabel(/^Tên nhân vật/).fill("Bình Minh");
  await manager.getByLabel("Ghi chú riêng — chỉ bạn xem được").fill("Bí mật mới");
  await manager.locator('input[type="file"]').setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Xong", exact: true }).click();
  await manager.getByRole("img", { name: "Ảnh đại diện hiện tại" }).waitFor();
  const uploads = await page.evaluate(() => window.__uploads);
  assert.equal(uploads.length, 1); assert.equal(uploads[0].bucket, "avatars");
  await manager.locator('button[type="submit"]').click();
  await manager.getByRole("heading", { name: "Bình Minh", exact: true }).waitFor();
  assert.equal(created.is_public, false);
  assert.equal(created.avatar_url, "https://cdn.test/avatars/author/character-book-1.jpg");
  const second = manager.locator("article").filter({ has: page.getByRole("heading", { name: "Bình Minh", exact: true }) });
  assert.equal(await second.getByRole("button", { name: /^Xoá/ }).count(), 0, "Delete offered after 15 minutes");
  const first = manager.locator("article").filter({ has: page.getByRole("heading", { name: "An Nhiên", exact: true }) });
  await first.getByRole("button", { name: "Lưu trữ", exact: true }).click();
  // Archived characters leave the default list; the shortcut must lead back to them.
  await manager.getByRole("button", { name: "Xem 1 nhân vật đã lưu trữ để khôi phục" }).click();
  await manager.getByRole("button", { name: "Khôi phục", exact: true }).click();
  await manager.getByLabel("Trạng thái", { exact: true }).selectOption("active");
  await first.getByRole("button", { name: "Xem chương xuất hiện" }).click();
  await first.getByRole("link", { name: "Chương đầu" }).waitFor();
  await first.getByRole("button", { name: "Sửa", exact: true }).click();
  await manager.getByLabel(/^Biệt danh/).fill("Tên mới");
  await manager.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await first.getByText("Tên khác: Tên mới", { exact: true }).waitFor();
  await manager.getByLabel("Tìm nhân vật", { exact: true }).fill("Bình Minh");
  assert.equal(await manager.locator("article").count(), 1);
  await manager.getByLabel("Tìm nhân vật", { exact: true }).fill("");
  await first.getByRole("button", { name: "Xoá (còn 15 phút)" }).click();
  await manager.getByText("Đã xoá “An Nhiên”.", { exact: true }).waitFor();
  assert.ok(deleted); assert.equal(await manager.locator("article").count(), 1);
  const chapter = page.getByRole("region", { name: "Gắn vào chương" });
  await chapter.getByRole("button", { name: "An Nhiên", exact: false }).click();
  await chapter.getByRole("alert").waitFor();
  assert.equal(await chapter.getByRole("button", { name: "An Nhiên", exact: false }).getAttribute("aria-pressed"), "false");
  await chapter.getByRole("button", { name: "An Nhiên", exact: false }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Gắn vào chương"] button[aria-pressed="true"]'));
  await chapter.getByRole("button", { name: "Thêm nhân vật tại đây" }).click();
  await chapter.getByLabel(/^Tên nhân vật/).fill("Khách đường xa");
  await chapter.locator('button[type="submit"]').click();
  await chapter.getByRole("button", { name: "Khách đường xa", exact: false }).waitFor();
  const reader = page.getByRole("region", { name: "Độc giả" });
  await reader.getByRole("button", { name: "Theo dõi", exact: true }).click();
  await reader.getByRole("link", { name: "Đăng nhập" }).waitFor();
  assert.equal(await reader.getByText("Chính diện", { exact: true }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await manager.getByRole("button", { name: "Thêm nhân vật", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Mobile viewport overflows");
  await page.screenshot({ path: ".tmp/character-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("PASS browser: create/edit, private default, duplicate warning, search, avatar upload+crop, archive/restore, 15-minute delete, appearances, quick create, stale-write recovery, follow login, hidden role, 390px layout.");
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
