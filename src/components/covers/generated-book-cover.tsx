import type { CoverEffect, CoverLayout } from "@/lib/covers/genre-styles";
import type { CoverSpec } from "@/lib/covers/build-cover-spec";
import { coverFontFamily } from "@/lib/covers/font-family";

/**
 * Renderer SVG chính của hệ thống bìa tự động — dùng trực tiếp trong JSX
 * (qua src/components/covers/book-cover.tsx) VÀ để renderToStaticMarkup()
 * ra file .svg (src/app/api/books/[id]/cover/route.ts). Scale theo
 * viewBox nên dùng được ở mọi kích thước hiển thị (thumbnail nhỏ tới
 * trang chi tiết) mà không vỡ nét — không dùng cho nhánh PNG/OG, xem
 * generated-book-cover-og.tsx cho nhánh đó (next/og render bằng mô hình
 * flexbox CSS, không hiểu <svg>/<text>/filter thô như file này).
 *
 * Nguyên tắc core/enhancement: chữ chính (core, render riêng trong JSX
 * dưới) LUÔN hiện được độc lập, không phụ thuộc filter/gradient nào cả —
 * mọi hiệu ứng trang trí (glow, shadow, turbulence, ornament...) là lớp
 * phụ vẽ tách biệt (enhancement), không che/thay thế lớp chữ chính.
 */

const VIEW_WIDTH = 480;
const VIEW_HEIGHT = 720;
const LINE_HEIGHT_RATIO = 1.18;
const PAD_X = 40;

type TitleBlock = {
  x: number;
  anchor: "start" | "middle";
  startY: number;
  centerY: number;
};

function layoutTitleBlock(layout: CoverLayout, lineCount: number, lineHeight: number): TitleBlock {
  const totalHeight = lineCount * lineHeight;
  switch (layout) {
    case "top-heavy":
      return { x: PAD_X, anchor: "start", startY: 150, centerY: 150 + totalHeight / 2 };
    case "left-aligned":
      return { x: PAD_X, anchor: "start", startY: 330, centerY: 330 + totalHeight / 2 };
    case "lower-third":
      return { x: PAD_X, anchor: "start", startY: 520, centerY: 520 + totalHeight / 2 };
    case "center":
    default: {
      const centerY = VIEW_HEIGHT / 2;
      return {
        x: VIEW_WIDTH / 2,
        anchor: "middle",
        startY: centerY - totalHeight / 2 + lineHeight * 0.8,
        centerY,
      };
    }
  }
}

export type GeneratedBookCoverProps = {
  spec: CoverSpec;
  className?: string;
};

export function GeneratedBookCover({ spec, className }: GeneratedBookCoverProps) {
  const fontFamily = coverFontFamily(spec.font);
  const { lines, fontSize } = spec.title;
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  const titleBlock = layoutTitleBlock(spec.layout, lines.length, lineHeight);

  // Id có seed để không đụng nhau khi nhiều bìa cùng render trên 1 trang
  // (ví dụ book-coverflow.tsx hiện nhiều cover cùng lúc).
  const uid = spec.effectSeed;
  const gradId = `cv-bg-${uid}`;
  const textGradId = `cv-text-${uid}`;
  const blurId = `cv-blur-${uid}`;
  const grainId = `cv-grain-${uid}`;
  const distressId = `cv-distress-${uid}`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={spec.palette.from} />
          <stop offset="1" stopColor={spec.palette.to} />
        </linearGradient>

        {spec.effect === "gradient-glow" && (
          <linearGradient id={textGradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={spec.palette.text} />
            <stop offset="1" stopColor={spec.palette.accent ?? spec.palette.text} />
          </linearGradient>
        )}

        {(spec.effect === "soft-glow" || spec.effect === "gradient-glow") && (
          <filter id={blurId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        )}

        {(spec.effect === "paper-grain" || spec.effect === "sepia-duotone") && (
          <filter id={grainId} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves={2}
              seed={uid}
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"
            />
          </filter>
        )}

        {spec.effect === "distressed" && (
          <filter id={distressId} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.02 0.09"
              numOctaves={2}
              seed={uid}
              result="turb"
            />
            <feDisplacementMap in="SourceGraphic" in2="turb" scale={7} />
          </filter>
        )}
      </defs>

      {/* core: nền */}
      <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={`url(#${gradId})`} />

      {/* enhancement: trang trí nền — thuần trang trí, không mang thông
          tin nào, an toàn nếu filter không hiện */}
      <BackgroundDecoration spec={spec} grainFilterId={grainId} />

      <g
        transform={
          spec.rotationDeg
            ? `rotate(${spec.rotationDeg} ${VIEW_WIDTH / 2} ${titleBlock.centerY})`
            : undefined
        }
      >
        {/* enhancement: lớp phía sau chữ chính (glow/shadow/drip) */}
        <TitleUnderlay
          spec={spec}
          titleBlock={titleBlock}
          fontFamily={fontFamily}
          lineHeight={lineHeight}
          blurFilterId={blurId}
          distressFilterId={distressId}
        />

        {/* core: chữ chính — luôn hiện được độc lập */}
        {lines.map((line, i) => (
          <text
            key={i}
            x={titleBlock.x}
            y={titleBlock.startY + i * lineHeight}
            textAnchor={titleBlock.anchor}
            fontFamily={fontFamily}
            fontWeight={spec.weight}
            fontSize={fontSize}
            letterSpacing={`${spec.letterSpacingEm}em`}
            fill={spec.effect === "gradient-glow" ? `url(#${textGradId})` : spec.palette.text}
          >
            {line}
          </text>
        ))}
      </g>

      {spec.author && (
        <text
          x={VIEW_WIDTH / 2}
          y={VIEW_HEIGHT - 48}
          textAnchor="middle"
          fontFamily={fontFamily}
          fontWeight={500}
          fontSize={18}
          letterSpacing="0.05em"
          fill={spec.palette.text}
          opacity={0.75}
        >
          {spec.author}
        </text>
      )}
    </svg>
  );
}

function BackgroundDecoration({
  spec,
  grainFilterId,
}: {
  spec: CoverSpec;
  grainFilterId: string;
}) {
  switch (spec.effect) {
    case "paper-grain":
      return (
        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} filter={`url(#${grainFilterId})`} />
      );
    case "sepia-duotone":
      return (
        <>
          <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} filter={`url(#${grainFilterId})`} />
          <line x1={40} y1={92} x2={440} y2={92} stroke={spec.palette.text} strokeWidth={1} opacity={0.35} />
          <line x1={40} y1={100} x2={440} y2={100} stroke={spec.palette.text} strokeWidth={1} opacity={0.35} />
        </>
      );
    case "hairline-border":
      return (
        <rect
          x={24}
          y={24}
          width={VIEW_WIDTH - 48}
          height={VIEW_HEIGHT - 48}
          fill="none"
          stroke={spec.palette.text}
          strokeWidth={1.5}
          opacity={0.4}
        />
      );
    case "gradient-glow":
      return <StarDots spec={spec} />;
    case "comic-shadow":
      return <RouteLine spec={spec} />;
    default:
      return null;
  }
}

function StarDots({ spec }: { spec: CoverSpec }) {
  const dots = Array.from({ length: 6 }, (_, i) => {
    const seed = spec.effectSeed + i * 97;
    return {
      x: 30 + (seed % 420),
      y: 30 + ((seed * 7) % 660),
      r: 1.5 + (seed % 3),
      key: i,
    };
  });
  return (
    <>
      {dots.map((d) => (
        <circle key={d.key} cx={d.x} cy={d.y} r={d.r} fill={spec.palette.accent ?? spec.palette.text} opacity={0.5} />
      ))}
    </>
  );
}

function RouteLine({ spec }: { spec: CoverSpec }) {
  const seed = spec.effectSeed;
  const y1 = 60 + (seed % 60);
  const y2 = 140 + ((seed * 3) % 60);
  return (
    <path
      d={`M -20 ${y1} Q 160 ${y2} 340 ${y1 - 20} T 520 ${y2}`}
      fill="none"
      stroke={spec.palette.accent ?? spec.palette.text}
      strokeWidth={3}
      strokeDasharray="10 8"
      opacity={0.35}
    />
  );
}

function TitleUnderlay({
  spec,
  titleBlock,
  fontFamily,
  lineHeight,
  blurFilterId,
  distressFilterId,
}: {
  spec: CoverSpec;
  titleBlock: TitleBlock;
  fontFamily: string;
  lineHeight: number;
  blurFilterId: string;
  distressFilterId: string;
}) {
  const { lines, fontSize } = spec.title;

  const shared = {
    fontFamily,
    fontWeight: spec.weight,
    fontSize,
    letterSpacing: `${spec.letterSpacingEm}em`,
    textAnchor: titleBlock.anchor,
  } as const;

  const effect: CoverEffect = spec.effect;

  if (effect === "soft-glow" || effect === "gradient-glow") {
    return (
      <>
        {lines.map((line, i) => (
          <text
            key={i}
            {...shared}
            x={titleBlock.x}
            y={titleBlock.startY + i * lineHeight}
            fill={effect === "gradient-glow" ? spec.palette.accent ?? spec.palette.text : spec.palette.text}
            filter={`url(#${blurFilterId})`}
            opacity={effect === "gradient-glow" ? 0.5 : 0.6}
          >
            {line}
          </text>
        ))}
      </>
    );
  }

  if (effect === "hard-shadow" || effect === "comic-shadow") {
    return (
      <>
        {lines.map((line, i) => (
          <text
            key={i}
            {...shared}
            x={titleBlock.x + 4}
            y={titleBlock.startY + i * lineHeight + 4}
            fill={spec.palette.accent ?? "#000000"}
            opacity={0.55}
          >
            {line}
          </text>
        ))}
      </>
    );
  }

  if (effect === "distressed") {
    return (
      <>
        {lines.map((line, i) => {
          // Jitter theo TỪNG DÒNG (không phải từng ký tự — đơn giản hoá
          // có chủ đích so với per-glyph jitter, vẫn tạo cảm giác lệch/
          // méo mà không cần tách tspan theo ký tự) — chỉ áp cho lớp
          // drip phụ này, chữ chính (core) phía trên luôn thẳng, đọc
          // được rõ.
          const jitter = ((spec.effectSeed + i * 53) % 7) - 3;
          return (
            <text
              key={i}
              {...shared}
              x={titleBlock.x + 4}
              y={titleBlock.startY + i * lineHeight + 6 + jitter}
              fill={spec.palette.accent ?? "#7f1d1d"}
              opacity={0.7}
              filter={`url(#${distressFilterId})`}
            >
              {line}
            </text>
          );
        })}
      </>
    );
  }

  return null;
}
