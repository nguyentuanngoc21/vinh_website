import sharp from "sharp";
import { injectPngXmp } from "@/lib/orders/xmp";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildTiledWatermarkSvg(width: number, height: number, label: string): string {
  const stepX = 260;
  const stepY = 140;
  const tiles: string[] = [];
  for (let y = -stepY; y < height + stepY; y += stepY) {
    for (let x = -stepX; x < width + stepX; x += stepX) {
      tiles.push(
        `<text x="${x}" y="${y}" transform="rotate(-22 ${x} ${y})" font-size="15" font-family="sans-serif" ` +
          `fill="rgba(255,255,255,0.32)" stroke="rgba(0,0,0,0.32)" stroke-width="0.4">${escapeXml(label)}</text>`
      );
    }
  }
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${tiles.join("")}</svg>`;
}

/** Gói XMP khai báo "không cho AI huấn luyện" — xem ghi chú quan trọng
 * (KHÔNG phải cơ chế chặn kỹ thuật) ở src/lib/orders/xmp.ts. */
function buildNoAiXmpPacket(buyerLabel: string, orderCode: string): string {
  const rights = `Không sử dụng để huấn luyện mô hình AI/máy học dưới bất kỳ hình thức nào. Bản giao cho ${escapeXml(
    buyerLabel
  )} qua đơn ${escapeXml(orderCode)} trên Vịnh Câu Chuyện.`;
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <xmpRights:Marked>True</xmpRights:Marked>
      <xmpRights:UsageTerms>${rights}</xmpRights:UsageTerms>
      <dc:rights>No AI training. Delivered via Vinh Cau Chuyen commission order ${escapeXml(orderCode)}.</dc:rights>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Bàn giao illustration (Mục 4.1 đặc tả) — chèn watermark tên/ID buyer mờ
 * lặp lại khắp ảnh (kiểu dấu chìm ở trang đọc, xem `.vn-wm` trong thiết
 * kế) + nhúng XMP "không cho AI huấn luyện". Luôn xuất PNG (để chèn được
 * iTXt XMP — xem injectPngXmp) bất kể định dạng gốc.
 *
 * LƯU Ý: watermark + XMP đều là biện pháp KHAI BÁO/RĂN ĐE, không phải mã
 * hoá hay DRM — ảnh vẫn xem/tải được bình thường, chỉ mang dấu để truy
 * vết nếu bị phát tán/dùng sai mục đích.
 */
export async function applyIllustrationWatermark(
  original: Buffer,
  opts: { buyerLabel: string; orderCode: string }
): Promise<Buffer> {
  const image = sharp(original);
  const meta = await image.metadata();
  const width = meta.width ?? 1200;
  const height = meta.height ?? 1200;
  const label = `${opts.buyerLabel} · ${opts.orderCode}`;
  const svg = Buffer.from(buildTiledWatermarkSvg(width, height, label));

  const watermarkedPng = await image
    .composite([{ input: svg, blend: "over" }])
    .png()
    .toBuffer();

  return injectPngXmp(watermarkedPng, buildNoAiXmpPacket(opts.buyerLabel, opts.orderCode));
}
