import type { CoverEffect, CoverLayout } from "@/lib/covers/genre-styles";
import type { CoverSpec } from "@/lib/covers/build-cover-spec";
import { coverFontFamily } from "@/lib/covers/font-family";

/**
 * Bố cục JSX riêng cho nhánh PNG/OG (`?format=png` ở
 * src/app/api/books/[id]/cover/route.ts), truyền trực tiếp vào
 * `next/og`'s `ImageResponse`. KHÔNG tái dùng generated-book-cover.tsx —
 * Satori (engine ImageResponse dùng) render theo mô hình flexbox/CSS
 * (div/span + style), không hiểu <svg>/<text>/SVG filter thô như file
 * đó. 2 file chia sẻ DỮ LIỆU qua CoverSpec, không chia sẻ JSX.
 *
 * Vì Satori không chắc hỗ trợ SVG filter (feTurbulence/feDisplacementMap
 * dùng ở bản SVG cho "Linh dị"/"Dã sử") — bản OG này dùng CSS
 * text-shadow/box-shadow tương đương thay cho filter đúng nghĩa. Chữ
 * chính luôn render bằng màu đặc (spec.palette.text), text-shadow chỉ là
 * lớp thêm — không phụ thuộc effect để đọc được tên sách.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
const CARD_WIDTH = 393;
const CARD_HEIGHT = 590; // ~2:3, khớp viewBox 480×720 của bản SVG
const CARD_TO_VIEWBOX_SCALE = CARD_WIDTH / 480;

function layoutAlignItems(layout: CoverLayout): "center" | "flex-start" {
  return layout === "center" ? "center" : "flex-start";
}

function layoutJustifyContent(layout: CoverLayout): "center" | "flex-start" | "flex-end" {
  switch (layout) {
    case "top-heavy":
      return "flex-start";
    case "lower-third":
      return "flex-end";
    case "left-aligned":
    case "center":
    default:
      return "center";
  }
}

// Xấp xỉ CSS cho hiệu ứng SVG filter tương ứng — không phải bản dịch 1:1
// (feTurbulence không có tương đương CSS thật), chỉ để OG image vẫn đúng
// tông màu/cảm giác thể loại dù không có turbulence/displacement thật.
function effectTextShadow(spec: CoverSpec): string | undefined {
  const accent = spec.palette.accent ?? spec.palette.text;
  switch (spec.effect as CoverEffect) {
    case "hard-shadow":
    case "comic-shadow":
      return "4px 4px 0 rgba(0,0,0,0.55)";
    case "soft-glow":
      return `0 0 18px ${accent}`;
    case "gradient-glow":
      return `0 0 22px ${accent}`;
    case "distressed":
      return `3px 3px 0 ${accent}, -1px -1px 0 rgba(0,0,0,0.4)`;
    case "circuit-lines":
      return `0 0 10px ${accent}, 0 0 2px ${accent}`;
    case "paper-grain":
    case "hairline-border":
    case "sepia-duotone":
    default:
      return undefined;
  }
}

export function buildOgCoverElement(spec: CoverSpec) {
  const fontFamily = coverFontFamily(spec.font);
  const { lines, fontSize } = spec.title;
  const scaledFontSize = Math.max(14, Math.round(fontSize * CARD_TO_VIEWBOX_SCALE));
  const bgGradient = `linear-gradient(135deg, ${spec.palette.from}, ${spec.palette.to})`;

  return (
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: bgGradient,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: OG_WIDTH,
          height: OG_HEIGHT,
          display: "flex",
          backgroundColor: "rgba(0,0,0,0.35)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: layoutAlignItems(spec.layout),
          justifyContent: layoutJustifyContent(spec.layout),
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          padding: "36px 30px",
          borderRadius: 10,
          backgroundImage: bgGradient,
          boxShadow: "0 30px 70px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily,
            fontWeight: spec.weight,
            fontSize: scaledFontSize,
            letterSpacing: spec.letterSpacingEm ? `${spec.letterSpacingEm}em` : undefined,
            color: spec.palette.text,
            textShadow: effectTextShadow(spec),
            lineHeight: 1.18,
          }}
        >
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
        {spec.author && (
          <div
            style={{
              display: "flex",
              marginTop: 18,
              fontFamily,
              fontSize: 15,
              color: spec.palette.text,
              opacity: 0.75,
              letterSpacing: "0.05em",
            }}
          >
            {spec.author}
          </div>
        )}
      </div>
    </div>
  );
}
