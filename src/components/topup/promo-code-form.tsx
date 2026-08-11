"use client";

import { Field } from "@/components/ui";
import type { PromoMessage } from "@/lib/topup";

type PromoCodeFormProps = {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  message: PromoMessage | null;
};

/** Promo code input + apply button, used on the token top-up order form. */
export function PromoCodeForm({ value, onChange, onApply, message }: PromoCodeFormProps) {
  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        <div className="min-w-[220px] flex-1">
          <Field
            label={null}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Nhập mã, ví dụ VINH10"
            className="uppercase"
          />
        </div>
        <button
          type="button"
          onClick={onApply}
          className="cursor-pointer whitespace-nowrap rounded-full border border-brand-ink px-6 py-[11px] text-sm font-semibold text-brand-ink"
        >
          Áp dụng
        </button>
      </div>
      {message && (
        <div
          className={`mt-2.5 text-[12.5px] font-medium ${
            message.tone === "success" ? "text-[#2C7453]" : "text-[#B02A37]"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
