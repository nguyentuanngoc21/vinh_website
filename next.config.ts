import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
