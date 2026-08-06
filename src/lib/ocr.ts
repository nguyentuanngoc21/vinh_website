import { createWorker } from "tesseract.js";

const OCR_DIGIT_REGEX = /\d{8,12}/g;

function normalizeDigits(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;

  const matches = digits.match(/\d{8,12}/g) ?? [];
  if (matches.length === 0) return null;

  const candidate = matches[0];
  if (!candidate) return null;

  if (candidate.length > 12) return candidate.slice(-12);
  if (candidate.length < 12) return candidate;
  return candidate;
}

export async function extractIdentityNumber(file: File): Promise<string | null> {
  const worker = await createWorker("vie", 1, {
    logger: () => undefined,
  });

  try {
    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const { data } = await worker.recognize(imageBuffer);
    const text = data?.text ?? "";
    const normalized = normalizeDigits(text);

    if (!normalized) {
      return null;
    }

    return normalized.replace(/\D/g, "");
  } catch {
    return null;
  } finally {
    await worker.terminate();
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
