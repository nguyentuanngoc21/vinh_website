"use client";

import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from "react";

/**
 * Multi-line sibling of `Field` (see field.tsx) — same label/hint/status
 * API, wraps a <textarea> instead of an <input>. Pulled out for the bio
 * field in edit-profile-tab.tsx and the message composer in chat-tab.tsx,
 * both of which previously hand-rolled their own <textarea> markup.
 */
type TextareaStatus = { tone: "success" | "error"; message: string };

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Pass `null` to omit the label entirely. */
  label: ReactNode | null;
  hint?: ReactNode;
  status?: TextareaStatus;
  /** className applies to the <textarea> itself; use this for the wrapping
   * <label> (e.g. `flex-1` in a flex row) — see Field's wrapperClassName. */
  wrapperClassName?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, status, className = "", wrapperClassName = "", rows = 4, ...textareaProps },
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
      <textarea
        ref={ref}
        rows={rows}
        className={`w-full resize-y rounded-[10px] border ${toneClass} px-[15px] py-3 text-[14.5px] text-ink focus:border-brand-ink focus:outline-none ${className}`}
        {...textareaProps}
      />
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
