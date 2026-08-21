/**
 * Auto-fit tên truyện: giảm font-size và/hoặc xuống dòng để không tràn
 * khung bìa. Không có canvas đo font thật ở server (SVG server-side, xem
 * generated-book-cover.tsx) — ước lượng độ rộng ký tự bằng 1 tỉ lệ cố định
 * so với font-size (avgGlyphWidthEm), tinh chỉnh bằng QA mắt sau khi có
 * bìa thật hiển thị, không phải số đo chính xác.
 */

export type TextFitBox = {
  width: number;
  maxLines: number;
};

export type TextFitFont = {
  baseFontSize: number;
  minFontSize: number;
  avgGlyphWidthEm: number;
  uppercase: boolean;
  letterSpacingEm: number;
};

export type TextFitResult = {
  fontSize: number;
  lines: string[];
};

// Chặn input bất thường (title cực dài) trước khi chạy thuật toán —
// phòng hộ cuối cùng, không phải cách xử lý chính (đó là shrink+wrap).
const MAX_TITLE_CHARS = 85;
const SHRINK_FACTOR = 0.9;
const MAX_SHRINK_ITERATIONS = 6;

// Ước lượng ban đầu, CHƯA đo bằng công cụ thật — xem comment đầu file.
// Weight nặng (800) vẽ rộng hơn weight thường ở cùng font-size.
export function estimateAvgGlyphWidthEm(font: "be-vietnam-pro" | "lora", weight: number): number {
  if (font === "lora") return 0.52;
  return weight >= 800 ? 0.58 : 0.56;
}

export function fitTitle(rawTitle: string, box: TextFitBox, font: TextFitFont): TextFitResult {
  const title = clampTitle(rawTitle.trim());
  const displayTitle = font.uppercase ? title.toLocaleUpperCase("vi") : title;

  let fontSize = font.baseFontSize;
  let lines = wrapForFontSize(displayTitle, box.width, fontSize, font);

  let iterations = 0;
  while (
    lines.length > box.maxLines &&
    fontSize > font.minFontSize &&
    iterations < MAX_SHRINK_ITERATIONS
  ) {
    fontSize = Math.max(font.minFontSize, fontSize * SHRINK_FACTOR);
    lines = wrapForFontSize(displayTitle, box.width, fontSize, font);
    iterations++;
  }

  // Đã hết lượt shrink mà vẫn tràn dòng: chấp nhận thêm đúng 1 dòng thừa
  // (theo lines đã wrap ở minFontSize) thay vì cắt mất chữ — clampTitle ở
  // trên đã lo phần "quá dài không thể nào vừa" rồi.
  return { fontSize, lines };
}

function wrapForFontSize(
  text: string,
  boxWidth: number,
  fontSize: number,
  font: TextFitFont
): string[] {
  const perCharEm =
    font.avgGlyphWidthEm * (font.uppercase ? 1.05 : 1) + font.letterSpacingEm;
  const estimatedCharWidth = fontSize * perCharEm;
  const maxCharsPerLine = Math.max(1, Math.floor(boxWidth / estimatedCharWidth));
  return wrapGreedy(text, maxCharsPerLine);
}

// Wrap theo từ; từ đơn dài hơn cả 1 dòng (không có dấu cách để wrap) bị
// hard-break giữa từ, để thuật toán không bao giờ treo/không tiến triển.
function wrapGreedy(text: string, maxCharsPerLine: number): string[] {
  const limit = Math.max(1, maxCharsPerLine);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > limit) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let remaining = word;
      while (remaining.length > limit) {
        lines.push(remaining.slice(0, limit));
        remaining = remaining.slice(limit);
      }
      current = remaining;
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function clampTitle(title: string): string {
  if (title.length <= MAX_TITLE_CHARS) return title;
  return `${title.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`;
}
