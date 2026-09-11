"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

/**
 * Shared text input used across auth forms, profile editing, and author
 * tools. Pulled out because the same
 *   rounded-[10px] border border-border-light px-[15px] py-3 ...
 * block was hand-copied into 10+ files. Change the look once here.
 *
 * `hint` is neutral helper text shown when there's no validation state.
 * `status` overrides it with success/error styling + message — pass this
 * from whatever validation logic the form already has (see register-form
 * or edit-profile-tab for the pattern: compute a `{state, message}` pair
 * and forward it as `status`).
 */
type FieldStatus = { tone: "success" | "error"; message: string };

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Pass `null` to omit the label entirely — e.g. when a custom header
   * row (label + an inline link) is rendered above the Field instead. */
  label: ReactNode | null;
  hint?: ReactNode;
  status?: FieldStatus;
  /** Render something (e.g. a show/hide-password button) inside the input's right edge. */
  suffix?: ReactNode;
  /** className applies to the <input> itself; use this for the wrapping
   * <label> (e.g. `flex-1` in a flex row) — the two are NOT interchangeable,
   * see chat-tab.tsx's composer for the bug this caused before this prop
   * existed. */
  wrapperClassName?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, status, suffix, className = "", wrapperClassName = "", ...inputProps },
  ref
) {
  const toneClass =
    status?.tone === "error"
      ? "border-error"
      : status?.tone === "success"
        ? "border-success-form"
        : "border-border-light";

  return (
    <label className={`block ${wrapperClassName}`}>
      {label !== null && (
        <div className="mb-[7px] text-[13px] font-semibold text-slate">{label}</div>
      )}
      <div className="relative">
        <input
          ref={ref}
          className={`w-full rounded-[10px] border ${toneClass} px-[15px] py-3 text-[14.5px] text-ink focus:border-brand-ink focus:outline-none ${
            suffix ? "pr-11" : ""
          } ${className}`}
          {...inputProps}
        />
        {suffix && (
          <div className="absolute right-[13px] top-1/2 -translate-y-1/2">{suffix}</div>
        )}
      </div>
      {(status || hint) && (
        <div
          className={`mt-1.5 text-xs ${
            status?.tone === "error"
              ? "text-error"
              : status?.tone === "success"
                ? "text-success-form"
                : "text-stone-light"
          }`}
        >
          {status ? status.message : hint}
        </div>
      )}
    </label>
  );
});
