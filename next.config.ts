import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js spawn worker_threads bằng path tính từ __dirname lúc chạy
  // (xem node_modules/tesseract.js/src/worker/node/defaultOptions.js). Nếu để
  // Next.js/Turbopack bundle package này vào Route Handler như bình thường,
  // __dirname không còn phản ánh đúng vị trí file thật trên đĩa nữa, khiến
  // workerPath tính sai và worker_threads báo MODULE_NOT_FOUND. Khai báo
  // external để Next dùng require() gốc của Node, giữ __dirname đúng.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
  serverExternalPackages: ["tesseract.js"],
  // Vì tesseract.js là external (dòng trên), Next dựa hoàn toàn vào
  // @vercel/nft để dò các file cần đóng gói lên Vercel — nhưng nft chỉ theo
  // dõi được require()/import tĩnh; worker Node của tesseract.js lại nạp
  // qua `new Worker(path)` (worker_threads), một tầng hoàn toàn vô hình với
  // nft. Hệ quả thực tế: nft có include được worker-script/node/index.js
  // (vì workerPath tính được từ __dirname lúc build), nhưng KHÔNG theo dõi
  // tiếp được các require() ngay trong chính file đó (`require('..')`,
  // `require('./getCore')`,...) — deploy lên Vercel báo
  // "Cannot find module '..'" dù chạy `next dev` bình thường không sao.
  // Ép include thủ công mọi package mà src/worker-script + src/worker/node
  // của tesseract.js require() tới (đã grep hết require() không tương đối
  // trong 2 thư mục đó để chốt danh sách — xem package.json của
  // tesseract.js để đối chiếu nếu bump version). Bỏ qua idb-keyval (chỉ
  // dùng ở nhánh browser) và opencollective-postinstall (chỉ chạy lúc cài,
  // không được require() lúc runtime).
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats
  outputFileTracingIncludes: {
    "/api/auth/register": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/zlibjs/**/*",
    ],
    // src/lib/covers/fonts.ts đọc font vendor qua fs.readFileSync(process.cwd()
    // + "/public/fonts/covers/...") lúc runtime (cho next/og's ImageResponse ở
    // route này) — `public/` thường được Vercel phục vụ qua CDN riêng, KHÔNG
    // tự đóng gói theo function serverless. Cùng bài học với tesseract.js ở
    // trên: ép include thủ công để tránh ENOENT khi deploy, dù chạy `next dev`
    // local không bao giờ gặp lỗi này (public/ luôn có sẵn trên đĩa lúc dev).
    "/api/books/[id]/cover": ["./public/fonts/covers/*.ttf"],
  },
  images: {
    remotePatterns: [
      // Token top-up flow renders its transfer QR from VietQR's image API
      // (src/lib/topup.ts#qrImageUrl) — see src/components/topup/qr-transfer-card.tsx.
      {
        protocol: "https",
        hostname: "img.vietqr.io",
        pathname: "/image/**",
      },
    ],
  },
};

export default nextConfig;
