"use client";

import { useId, type CSSProperties } from "react";

type VinhMarkProps = {
  /** Icon edge length in px. Sizes below 40 drop the water-spout mask and gold spine tick — they don't read at small sizes. */
  size?: number;
  /**
   * "ink" for placement on light surfaces, "cream" for placement on dark/navy surfaces,
   * "current" to inherit color from an ancestor — pair with `style={{ color: ... }}`
   * for contexts like the reader, where the surface colour is theme-driven.
   */
  tone?: "ink" | "cream" | "current";
  className?: string;
  style?: CSSProperties;
};

const FILL_BY_TONE: Record<"ink" | "cream", string> = {
  ink: "var(--color-brand-ink)",
  cream: "var(--color-cream-card-alt)",
};

/**
 * Vịnh's whale-and-book mark, bare (no ring text, no colour badge) — the "ứng dụng, bản rút
 * gọn" cut of the crest from the brand identity update. Source: Claude Design project
 * "Thiết kế website Vịnh" → `Vịnh Logo.dc.html`.
 *
 * For the badged app-icon variant (rounded-square navy background), see `src/app/icon.svg`.
 */
export function VinhMark({ size = 28, tone = "current", className, style }: VinhMarkProps) {
  const maskId = useId();
  const detailed = size >= 40;
  const fill = tone === "current" ? "currentColor" : FILL_BY_TONE[tone];

  return (
    <svg
      width={size}
      height={size}
      viewBox="60 60 280 280"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {detailed && (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
            <rect x="0" y="0" width="400" height="400" fill="#fff" />
            <g
              fill="none"
              stroke="#000"
              strokeWidth={9}
              strokeLinecap="round"
              transform="translate(200,172) scale(0.58) translate(-201,-228)"
            >
              <path d="M100 100 Q 150 150 214 196" />
              <path d="M108 120 Q 158 168 219 209" />
              <path d="M118 141 Q 168 184 223 221" />
              <path d="M131 162 Q 177 200 225 232" />
            </g>
          </mask>
        </defs>
      )}
      <g
        mask={detailed ? `url(#${maskId})` : undefined}
        transform="translate(200,172) scale(0.58) translate(-201,-228)"
        fill={fill}
      >
        <path d="M90 92 C108 66 152 60 176 73 C240 88 306 130 310 182 C313 214 306 238 297 259 C288 285 276 297 264 307 C252 318 241 323 233 326 C214 312 190 302 172 305 C152 308 141 312 138 318 C152 334 174 340 191 337 C200 352 205 372 214 390 C231 396 245 368 248 348 C250 336 249 330 246 322 C258 302 268 272 262 238 C256 210 248 192 240 180 C232 168 220 166 212 172 C224 190 230 214 228 240 C216 224 206 212 196 202 C164 184 118 140 90 92 Z" />
      </g>
      <path
        d="M200 292 C176 276 146 269 116 271 L116 292 C146 290 176 298 200 315 C224 298 254 290 284 292 L284 271 C254 269 224 276 200 292 Z"
        fill={fill}
      />
      {detailed && (
        <path d="M198 292 L198 316 L202 316 L202 292 Z" fill="var(--color-brand-gold)" />
      )}
    </svg>
  );
}
