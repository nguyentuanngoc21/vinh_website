import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { type ReactNode } from "react";

/**
 * Custom checkbox (native checkboxes are hard to restyle consistently).
 * Pulled from the "I agree to the terms" control in register-form — reuse
 * this anywhere else a checked/unchecked toggle with a label is needed.
 */
export function Checkbox({
  checked,
  onChange,
  children,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onChange} disabled={disabled}
      className="flex cursor-pointer items-start gap-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60">
      <span
        className={`mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
          checked ? "border-brand-ink bg-brand-ink" : "border-border-light bg-white"
        }`}
      >
        <CheckIcon
          weight="bold"
          size={12}
          className={`text-white transition-opacity ${checked ? "opacity-100" : "opacity-0"}`}
        />
      </span>
      <span className="text-[13px] leading-[1.6] text-slate">{children}</span>
    </button>
  );
}
