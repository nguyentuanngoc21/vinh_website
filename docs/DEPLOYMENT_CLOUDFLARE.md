# Triển khai lên Cloudflare

Tính đến giữa 2026, Cloudflare khuyến nghị dùng **`@opennextjs/cloudflare`
+ Cloudflare Workers** cho Next.js App Router — không dùng Cloudflare Pages
nữa (Pages chỉ chạy được Edge runtime, thiếu nhiều tính năng App Router).
`@opennextjs/cloudflare` hỗ trợ Next.js 16 và chạy Node.js runtime đầy đủ.

## 1. Cài đặt

```bash
npm install --save-dev @opennextjs/cloudflare wrangler
```

## 2. `wrangler.toml`

```toml
name = "vinh"
main = ".open-next/worker.js"
compatibility_date = "2026-02-12"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"

# Nếu dùng R2 cho ảnh CCCD/bìa sách thay vì Supabase Storage:
# [[r2_buckets]]
# binding = "MEDIA_BUCKET"
# bucket_name = "vinh-media"
```

## 3. Script build & deploy

Thêm vào `package.json`:

```json
{
  "scripts": {
    "build:cf": "next build && opennextjs-cloudflare build",
    "deploy:cf": "npm run build:cf && wrangler deploy",
    "preview:cf": "npm run build:cf && wrangler dev"
  }
}
```

## 4. Biến môi trường

Set qua `wrangler secret put <TÊN>` cho các giá trị nhạy cảm (không đưa
vào `wrangler.toml`):

```bash
wrangler secret put SESSION_SECRET
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Các biến `NEXT_PUBLIC_*` vẫn cần có ở **build time** (đặt trong CI hoặc
`.env.local` khi chạy `next build`), vì chúng được inline vào bundle
client — không phải secret runtime.

## 5. `proxy.ts` chạy Edge hay Node trên Cloudflare?

`@opennextjs/cloudflare` chạy toàn bộ app trên Node.js runtime của Workers
(khác với `@cloudflare/next-on-pages` cũ chỉ có Edge). `src/proxy.ts` hiện
dùng Web Crypto (`crypto.subtle`) — hoạt động bình thường ở cả hai runtime,
nên không cần sửa gì khi chuyển sang Cloudflare.

## 6. Ảnh/audio dung lượng lớn: R2 thay vì Storage của Supabase?

Cả hai đều dùng được. Nếu đã deploy trên Cloudflare, dùng **R2** cho file
audio (`audio-catalog.ts` hiện là mock) sẽ rẻ hơn đáng kể vì R2 không tính
phí egress — quan trọng với file audio phát trực tiếp nhiều lần. Ảnh CCCD
và bìa sách (nhỏ, ít băng thông hơn) để nguyên ở Supabase Storage cho đơn
giản, tận dụng RLS đã viết sẵn trong `schema.sql`.

## Tham khảo

- Cloudflare Workers Next.js guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- OpenNext Cloudflare adapter: https://opennext.js.org/cloudflare
