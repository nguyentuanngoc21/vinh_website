"use client";

import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Checkbox, RadioGroup } from "@/components/ui";
import {
  AGE_RATINGS,
  AGE_RATING_DESCRIPTIONS,
  AGE_RATING_LABELS,
  CONTENT_WARNINGS,
  minRatingForWarnings,
  ratingAtLeast,
  type AgeRating,
} from "@/lib/age-rating";

/**
 * Chọn nhãn độ tuổi + cảnh báo nội dung (publish-panel.tsx, mục "Phân loại").
 * Tick 1 cảnh báo tự nâng độ tuổi lên mức tối thiểu của nó; các mức thấp hơn
 * bị khoá. Khi admin đã khoá nhãn: chỉ hiển thị, không sửa.
 */
export function AgeRatingPicker({
  rating,
  warnings,
  onChange,
  locked = false,
  error = null,
}: {
  rating: AgeRating;
  warnings: string[];
  onChange: (rating: AgeRating, warnings: string[]) => void;
  locked?: boolean;
  error?: string | null;
}) {
  const floor = minRatingForWarnings(warnings);

  const toggleWarning = (id: string) => {
    const next = warnings.includes(id) ? warnings.filter((w) => w !== id) : [...warnings, id];
    const nextFloor = minRatingForWarnings(next);
    onChange(ratingAtLeast(rating, nextFloor) ? rating : nextFloor, next);
  };

  return (
    <div className="flex flex-col gap-3.5">
      {locked && (
        <div className="flex items-start gap-2 rounded-lg bg-cream-card px-3 py-2.5 text-[12.5px] leading-[1.5] text-slate">
          <LockKeyIcon size={15} className="mt-0.5 shrink-0 text-brand-gold-dark" />
          Nhãn độ tuổi đã được ban kiểm duyệt khoá. Liên hệ hỗ trợ nếu bạn cần thay đổi.
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <RadioGroup<AgeRating>
        label={null}
        aria-label="Độ tuổi"
        value={rating}
        onChange={(next) => onChange(next, warnings)}
        disabled={locked}
        options={AGE_RATINGS.map((value) => ({
          value,
          label: AGE_RATING_LABELS[value],
          description: AGE_RATING_DESCRIPTIONS[value],
          disabled: !ratingAtLeast(value, floor),
        }))}
      />

      <div>
        <div className="mb-1.5 text-[13px] font-medium text-ink-muted">Cảnh báo nội dung</div>
        <p className="mb-2.5 text-[12px] leading-[1.5] text-stone-alt">
          Chọn mọi nội dung có trong truyện. Một số cảnh báo yêu cầu độ tuổi tối thiểu.
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
          {CONTENT_WARNINGS.map((w) => (
            <Checkbox key={w.id} checked={warnings.includes(w.id)} onChange={() => toggleWarning(w.id)} disabled={locked}>
              {w.label} <span className="text-stone-alt">({w.minRating}+)</span>
            </Checkbox>
          ))}
        </div>
      </div>
    </div>
  );
}
