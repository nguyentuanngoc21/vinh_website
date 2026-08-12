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
