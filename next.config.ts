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
  // Ép include thủ công toàn bộ 2 package OCR cần tới runtime.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats
  outputFileTracingIncludes: {
    "/api/auth/register": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/wasm-feature-detect/**/*",
    ],
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
