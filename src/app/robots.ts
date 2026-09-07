import type { MetadataRoute } from "next";

// Cơ chế THẬT duy nhất khả dụng để "không cho AI huấn luyện" trên
// TRUYỆN CHỮ — không như ảnh (nhúng XMP, xem
// src/lib/copyright/public-asset-watermark.ts) hay audio (khai báo DB,
// xem src/app/api/audio/route.ts), text không có "file" để nhúng
// metadata ẩn vào. Chặn theo user-agent các AI-crawler đã biết công khai
// dùng để thu thập dữ liệu huấn luyện — quy ước thật nhiều site lớn đang
// dùng (không phải bịa), nhưng cũng chỉ là KHAI BÁO: các crawler này
// không BẮT BUỘC phải tôn trọng robots.txt, chỉ những bên tuân thủ chuẩn
// mới dừng lại (đúng tinh thần "khai báo/răn đe, không phải chặn kỹ
// thuật tuyệt đối" đã ghi ở src/lib/orders/xmp.ts).
//
// Vẫn cho phép bình thường các crawler tìm kiếm thật (Googlebot,
// Bingbot...) — chỉ chặn nhóm được biết là dùng cho huấn luyện AI/LLM.
const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "Google-Extended",
  "CCBot",
  "anthropic-ai",
  "ClaudeBot",
  "Claude-Web",
  "Bytespider",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "Omgili",
  "FacebookBot",
  "Meta-ExternalAgent",
  "Applebot-Extended",
  "Amazonbot",
  "PerplexityBot",
  "YouBot",
  "Timpibot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...AI_TRAINING_CRAWLERS.map((userAgent) => ({ userAgent, disallow: "/" })),
    ],
  };
}
