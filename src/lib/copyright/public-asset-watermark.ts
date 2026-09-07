import sharp from "sharp";
import { injectPngXmp } from "@/lib/orders/xmp";

/**
 * Nhúng XMP "không cho AI huấn luyện" vào ẢNH CÔNG KHAI (ảnh Thiết kế,
 * bìa truyện...) — khác `src/lib/orders/watermark.ts` (chỉ áp cho ảnh
 * minh hoạ GIAO RIÊNG cho 1 buyer trong đơn Kết nối, có watermark chữ
 * hiện rõ + gắn tên buyer/mã đơn để truy vết). Ở đây:
 *   - KHÔNG chèn hoạ tiết chữ đè lên ảnh — ảnh công khai (portfolio hoạ
 *     sĩ) cần giữ nguyên thẩm mỹ, không phải bản giao riêng cần đánh dấu
 *     "đây là bản xem trước".
 *   - Chỉ nhúng ẨN trong metadata XMP (không nhìn thấy khi xem ảnh bình
 *     thường) — ghi nhận người giữ quyền + tuyên bố không cho AI huấn
 *     luyện.
 *
 * LƯU Ý (như đã ghi ở orders/xmp.ts): đây là biện pháp KHAI BÁO/RĂN ĐE,
 * không phải DRM — công cụ scrape/train ảnh không bị bắt buộc phải đọc
 * trường này. Luôn ép ảnh về PNG (giống applyIllustrationWatermark) vì
 * sharp không có API ghi XMP tuỳ ý cho JPEG/WEBP.
 */
function buildPublicNoAiXmpPacket(rightsHolderLabel: string): string {
  const rights = `Tác phẩm của ${rightsHolderLabel} trên Vịnh. Không sử dụng để huấn luyện mô hình AI/máy học dưới bất kỳ hình thức nào.`;
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <xmpRights:Marked>True</xmpRights:Marked>
      <xmpRights:UsageTerms>${rights}</xmpRights:UsageTerms>
      <dc:rights>No AI training. © ${rightsHolderLabel} via Vinh Cau Chuyen.</dc:rights>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export async function applyPublicAssetWatermark(original: Buffer, rightsHolderLabel: string): Promise<Buffer> {
  const png = await sharp(original).png().toBuffer();
  return injectPngXmp(png, buildPublicNoAiXmpPacket(rightsHolderLabel));
}
