"use client";

import { MinusIcon, PlusIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { Field } from "@/components/ui";
import { formatTokens, formatVnd, type TokenPack } from "@/lib/topup";

type CustomAmountModalProps = {
  open: boolean;
  /** Raw text in the number field — kept separate from the committed quantity so mid-typing states (e.g. empty) don't glitch the preview below. */
  draft: string;
  onDraftChange: (draft: string) => void;
  onStep: (delta: number) => void;
  quickAmounts: number[];
  onPickQuick: (amount: number) => void;
  previewPack: TokenPack;
  isValid: boolean;
  hint: string;
  onClose: () => void;
  onConfirm: () => void;
};

/** Modal for the "Khác" pack tile — pick any quantity, min 50 tokens. */
export function CustomAmountModal({
  open,
  draft,
  onDraftChange,
  onStep,
  quickAmounts,
  onPickQuick,
  previewPack,
  isValid,
  hint,
  onClose,
  onConfirm,
}: CustomAmountModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-brand-ink-dark/55 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-[20px] bg-white p-7 shadow-[0_24px_60px_rgba(0,0,0,.28)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-[family-name:var(--font-lora)] text-xl font-bold text-brand-ink">
              Chọn số token muốn nạp
            </div>
            <div className="mt-1 text-[13px] leading-[1.6] text-stone-dark">
              Nhập số lượng bất kỳ, số tiền chuyển khoản sẽ tự cập nhật.
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 cursor-pointer text-stone">
            <XIcon size={20} />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onStep(-100)}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-cream text-brand-ink"
          >
            <MinusIcon size={17} />
          </button>
          <Field
            label={null}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            className="flex-1 text-center text-xl font-bold text-brand-ink"
          />
          <button
            type="button"
            onClick={() => onStep(100)}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-cream text-brand-ink"
          >
            <PlusIcon size={17} />
          </button>
        </div>
        <div className={`mt-2 text-[12.5px] ${isValid ? "text-stone" : "font-medium text-[#B02A37]"}`}>{hint}</div>

        <div className="mt-4 flex flex-wrap gap-2">
          {quickAmounts.map((amount) => {
            const active = String(amount) === draft;
            return (
              <button
                key={amount}
                type="button"
                onClick={() => onPickQuick(amount)}
                className={`cursor-pointer rounded-full border px-[15px] py-2 text-[13px] font-semibold ${
                  active ? "border-brand-ink bg-cream-card text-brand-ink" : "border-cream text-stone-dark"
                }`}
              >
                {formatTokens(amount)}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3.5 rounded-[14px] bg-brand-ink-dark px-[18px] py-4">
          <div>
            <div className="text-[10.5px] font-semibold tracking-[1.2px] text-sidebar-text-dim-2">
              SỐ TIỀN CHUYỂN KHOẢN
            </div>
            <div className="mt-[3px] text-2xl font-extrabold text-brand-gold-light">
              {formatVnd(previewPack.price)}
            </div>
          </div>
          <div className="text-right text-[13px] font-medium text-sidebar-text-dim-2">
            {formatTokens(previewPack.amount)} token
          </div>
        </div>

        <div className="mt-[18px] flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full border border-cream px-[22px] py-3 text-sm font-medium text-stone-dark"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!isValid}
            className="flex-1 cursor-pointer rounded-full bg-brand-gold py-3 text-center text-sm font-bold text-brand-ink disabled:cursor-default disabled:bg-[#efedea] disabled:text-[#b3aca3]"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}
