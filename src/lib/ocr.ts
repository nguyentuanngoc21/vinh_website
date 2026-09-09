import { createWorker } from "tesseract.js";
import sharp from "sharp";

const CCCD_DIGIT_LENGTH = 12;

/**
 * Tìm mọi dãy số CÓ THỂ là số CCCD trong text OCR ra.
 *
 * Bug ở bản trước: `text.replace(/\D/g, "")` xoá hết ký tự không phải số
 * của TOÀN BỘ text trước khi tìm — làm vậy nối liền các dãy số KHÁC NHAU
 * trên thẻ (ngày sinh, ngày hết hạn, số CCCD...) thành 1 chuỗi số dài dằng
 * dặc, rồi chỉ lấy 12 ký tự ĐẦU TIÊN của chuỗi đó làm candidate DUY NHẤT.
 * Nếu số CCCD không phải dãy số đầu tiên Tesseract đọc ra theo thứ tự
 * (rất dễ xảy ra: mã QR hoặc nền ảnh bị đọc nhầm thành ký tự số ở phía
 * trên số CCCD, hoặc ngày sinh/ngày hết hạn nằm trước số CCCD trong bố
 * cục thẻ) thì kết quả sai hẳn, không có candidate nào khác để đối chiếu.
 *
 * Cách mới: chỉ gộp khoảng trắng NẰM GIỮA 2 CHỮ SỐ (lỗi OCR hay tách rời
 * 1 số thành "0750 9502 3219" do kerning font) — vẫn giữ nguyên chữ/dấu
 * câu khác làm ranh giới giữa các dãy số riêng biệt trên thẻ. Sau đó lấy
 * TẤT CẢ dãy số dài ≥ 12 ký tự (12 là độ dài chuẩn, cố định của số CCCD —
 * không có gì để làm với dãy ngắn hơn), trả về toàn bộ candidate thay vì
 * chỉ 1 cái đầu tiên — verifyCccdAgainstImages() bên dưới đối chiếu số đã
 * nhập với TẤT CẢ candidate từ cả 2 ảnh, không chỉ tin vào ảnh/vị trí đầu
 * tiên tìm được.
 */
function extractDigitCandidates(text: string): string[] {
  const collapsed = text.replace(/(\d)[ \t]+(?=\d)/g, "$1");
  const runs = collapsed.match(/\d{12,}/g) ?? [];

  const candidates = new Set<string>();
  for (const run of runs) {
    if (run.length === CCCD_DIGIT_LENGTH) {
      candidates.add(run);
    } else {
      // Dài hơn 12 — dính thêm số khác vì thiếu ranh giới (ví dụ số CCCD
      // liền ngay số MRZ tiếp theo). Thử cả 12 ký tự đầu lẫn 12 ký tự
      // cuối, khả năng 1 trong 2 đúng số CCCD cao hơn nhiều so với chỉ
      // thử 1 phía.
      candidates.add(run.slice(0, CCCD_DIGIT_LENGTH));
      candidates.add(run.slice(-CCCD_DIGIT_LENGTH));
    }
  }
  return [...candidates];
}

// tesseract.js không tự đặt timeout: nếu createWorker()/recognize() phải tải
// tesseract-core.wasm.js hoặc vie.traineddata từ CDN ngoài (unpkg/jsdelivr) mà
// mạng chậm hoặc bị chặn, hoặc worker thread bị treo, thì await ở đây không
// bao giờ resolve/reject — kéo theo cả request POST /api/auth/register treo
// ở trạng thái pending vô hạn. Bọc timeout để luôn trả lỗi rõ ràng.
const OCR_TIMEOUT_MS = 20_000;

/**
 * Ảnh CCCD do người dùng tự chụp/upload có thể bị xoay: EXIF orientation sai
 * hoặc bị strip mất (rất phổ biến khi ảnh đi qua app chat/mạng xã hội trước
 * khi tải lên), hoặc người dùng chụp ngang rồi upload thẳng không xoay lại.
 * Tesseract đọc chữ bị xoay 90/270 độ gần như luôn thất bại (không tìm ra
 * candidate nào), và ở 180 độ thì đọc RA được nhưng SAI (số bị đảo/lẫn) —
 * nguy hiểm hơn vì verifyCccdAgainstImages() không có cách phân biệt "sai vì
 * xoay ngược" với "sai vì ảnh không phải thẻ này".
 *
 * Xử lý theo 2 bước:
 *  1) Chuẩn hoá theo EXIF orientation (sharp().rotate() không tham số) trước
 *     khi OCR — sửa được phần lớn case ảnh có EXIF hợp lệ mà chỉ hiển thị
 *     xoay do trình duyệt tự render theo EXIF (giống hiện tượng ảnh xem
 *     ngoài thì đúng chiều nhưng buffer gốc lại xoay).
 *  2) Luôn thử thêm cả 90/180/270 độ THỦ CÔNG trên ảnh đã chuẩn hoá — bù cho
 *     trường hợp ảnh không có EXIF orientation (hoặc bị strip) nên bước 1
 *     không sửa được.
 *
 * QUAN TRỌNG: không được dừng ngay khi một góc cho ra candidate đầu tiên.
 * Test thực tế cho thấy ở góc SAI (đặc biệt lệch ~180 độ so với chiều đúng),
 * Tesseract không im lặng thất bại mà đọc RA một dãy 12 số — chỉ là sai. Nếu
 * dừng sớm ở góc sai này, candidate đúng (nằm ở góc thử sau đó) không bao giờ
 * được thêm vào danh sách, khiến verifyCccdAgainstImages() reject oan ảnh
 * hợp lệ. Vì vậy phải thử đủ cả 4 góc và GỘP candidate của tất cả các góc lại
 * — đúng tinh thần "trả về toàn bộ candidate thay vì chỉ 1 cái" đã áp dụng ở
 * extractDigitCandidates() phía trên, chỉ là áp dụng thêm ở cấp độ góc xoay.
 * Đánh đổi: luôn chạy OCR đủ 4 lần (thay vì 1) — chấp nhận được vì đây là
 * bước xác minh giấy tờ tuỳ thân, ưu tiên độ chính xác hơn tốc độ.
 */
const ROTATION_FALLBACK_ANGLES = [0, 90, 180, 270] as const;
// Các lượt xoay thử thêm (sau lượt đầu) ít khả năng đúng hơn — dùng timeout
// ngắn hơn để worst-case tổng thời gian không quá tệ.
const ROTATION_FALLBACK_TIMEOUT_MS = 10_000;

async function normalizeOrientation(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer).rotate().toBuffer();
  } catch (err) {
    // Ảnh không decode được qua sharp (định dạng lạ/hỏng) — để nguyên buffer
    // gốc, cứ thử OCR thẳng, tesseract tự báo lỗi nếu thật sự không đọc được.
    console.error("[ocr] normalizeOrientation failed, using raw buffer:", err);
    return buffer;
  }
}

async function rotateBuffer(buffer: Buffer, angle: 90 | 180 | 270): Promise<Buffer> {
  return sharp(buffer).rotate(angle).toBuffer();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Trả về mọi dãy 12 chữ số tìm được trong ảnh — xem extractDigitCandidates()
 * để biết vì sao trả cả danh sách thay vì 1 giá trị duy nhất. */
export async function extractIdentityNumber(file: File): Promise<string[]> {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    worker = await withTimeout(
      createWorker("vie", 1, { logger: () => undefined }),
      OCR_TIMEOUT_MS,
      "createWorker"
    );

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const normalized = await normalizeOrientation(rawBuffer);

    // Gộp candidate của TẤT CẢ các góc — xem comment ở ROTATION_FALLBACK_ANGLES
    // để biết vì sao không được dừng sớm ở góc đầu tiên có candidate.
    const allCandidates = new Set<string>();
    for (const angle of ROTATION_FALLBACK_ANGLES) {
      const attemptBuffer = angle === 0 ? normalized : await rotateBuffer(normalized, angle);
      const timeoutMs = angle === 0 ? OCR_TIMEOUT_MS : ROTATION_FALLBACK_TIMEOUT_MS;
      const { data } = await withTimeout(
        worker.recognize(attemptBuffer),
        timeoutMs,
        `worker.recognize (${angle}deg)`
      );
      for (const candidate of extractDigitCandidates(data?.text ?? "")) {
        allCandidates.add(candidate);
      }
    }
    return [...allCandidates];
  } catch (err) {
    console.error("[ocr] extractIdentityNumber failed:", err);
    return [];
  } finally {
    // worker có thể chưa kịp gán (createWorker() timeout) — terminate() chỉ
    // gọi được khi đã có instance, và không chờ nó nếu nó cũng bị treo.
    if (worker) {
      await withTimeout(worker.terminate(), 3_000, "terminate").catch(() => {});
    }
  }
}

export async function verifyCccdAgainstImages(cccd: string, front: File, back: File): Promise<boolean> {
  const target = cccd.replace(/\D/g, "");
  const [frontCandidates, backCandidates] = await Promise.all([
    extractIdentityNumber(front),
    extractIdentityNumber(back),
  ]);

  return [...frontCandidates, ...backCandidates].includes(target);
}
