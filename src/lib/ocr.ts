import { createWorker } from "tesseract.js";

const OCR_DIGIT_REGEX = /\d{8,12}/g;

function normalizeDigits(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;

  const matches = digits.match(OCR_DIGIT_REGEX) ?? [];
  if (matches.length === 0) return null;

  const candidate = matches[0];
  if (!candidate) return null;

  if (candidate.length > 12) return candidate.slice(-12);
  if (candidate.length < 12) return candidate;
  return candidate;
}

// tesseract.js không tự đặt timeout: nếu createWorker()/recognize() phải tải
// tesseract-core.wasm.js hoặc vie.traineddata từ CDN ngoài (unpkg/jsdelivr) mà
// mạng chậm hoặc bị chặn, hoặc worker thread bị treo, thì await ở đây không
// bao giờ resolve/reject — kéo theo cả request POST /api/auth/register treo
// ở trạng thái pending vô hạn. Bọc timeout để luôn trả lỗi rõ ràng.
const OCR_TIMEOUT_MS = 20_000;

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

export async function extractIdentityNumber(file: File): Promise<string | null> {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    worker = await withTimeout(
      createWorker("vie", 1, { logger: () => undefined }),
      OCR_TIMEOUT_MS,
      "createWorker"
    );

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const { data } = await withTimeout(worker.recognize(imageBuffer), OCR_TIMEOUT_MS, "worker.recognize");
    const text = data?.text ?? "";
    const normalized = normalizeDigits(text);

    if (!normalized) {
      return null;
    }

    return normalized.replace(/\D/g, "");
  } catch (err) {
    console.error("[ocr] extractIdentityNumber failed:", err);
    return null;
  } finally {
    // worker có thể chưa kịp gán (createWorker() timeout) — terminate() chỉ
    // gọi được khi đã có instance, và không chờ nó nếu nó cũng bị treo.
    if (worker) {
      await withTimeout(worker.terminate(), 3_000, "terminate").catch(() => {});
    }
  }
}

export async function verifyCccdAgainstImages(cccd: string, front: File, back: File): Promise<boolean> {
  const [frontDigits, backDigits] = await Promise.all([
    extractIdentityNumber(front),
    extractIdentityNumber(back),
  ]);

  const candidates = [frontDigits, backDigits].filter((value): value is string => !!value);
  if (candidates.length === 0) {
    return false;
  }

  return candidates.some((value) => value.replace(/\D/g, "") === cccd.replace(/\D/g, ""));
}
