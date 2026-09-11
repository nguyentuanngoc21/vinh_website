"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { VIETNAM_BANKS, type VietnamBank } from "@/lib/banks";

type BankSelectProps = {
  value: VietnamBank | null;
  onChange: (bank: VietnamBank) => void;
  className?: string;
};

// So khớp không phân biệt hoa/thường và dấu tiếng Việt — gõ "vietcombank"
// hay "ngoai thuong" đều ra kết quả, giống cách người dùng thực sự gõ.
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks left by NFD
    .replace(/đ/gi, "d")
    .toLowerCase();
}

/**
 * Combobox gõ-để-lọc chọn ngân hàng thụ hưởng — theo style Field (border/
 * focus giống các input khác) nhưng có phần dropdown lọc động, khác
 * genre-select.tsx (chip-picker, không có ô gõ) nên tách component riêng.
 */
export function BankSelect({ value, onChange, className }: BankSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // -1 = không mục nào được highlight (trạng thái mở ban đầu, trước khi
  // người dùng gõ mũi tên lần nào) — khác 0 (mục đầu tiên) để Enter khi
  // chưa từng bấm mũi tên không tự chọn nhầm mục đầu.
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return VIETNAM_BANKS;
    return VIETNAM_BANKS.filter(
      (bank) => normalize(bank.name).includes(q) || normalize(bank.shortName).includes(q) || normalize(bank.code).includes(q)
    );
  }, [query]);

  const displayValue = open ? query : value ? `${value.shortName} — ${value.name}` : "";

  const selectBank = (bank: VietnamBank) => {
    onChange(bank);
    setQuery("");
    setOpen(false);
    setHighlightedIndex(-1);
  };

  // Không đụng tới việc gõ lọc (onChange của input) — chỉ xử lý 4 phím
  // điều hướng/chọn/đóng, mọi phím khác (kể cả chữ/số đang gõ dở) đi qua
  // bình thường.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlightedIndex((i) => (i + 1 >= results.length ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlightedIndex((i) => (i - 1 < 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (open && highlightedIndex >= 0 && results[highlightedIndex]) {
        e.preventDefault();
        selectBank(results[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setHighlightedIndex(-1);
      }
    }
  };

  const listboxId = "bank-select-listbox";

  return (
    <div ref={rootRef} className="relative">
      <label className="block">
        <div className="mb-[7px] text-[13px] font-semibold text-slate">Ngân hàng thụ hưởng</div>
        <div className="relative">
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={
              open && highlightedIndex >= 0 && results[highlightedIndex]
                ? `bank-option-${results[highlightedIndex].code}`
                : undefined
            }
            value={displayValue}
            onFocus={() => {
              setQuery("");
              setOpen(true);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlightedIndex(-1);
            }}
            onKeyDown={onKeyDown}
            placeholder="Gõ tên ngân hàng để tìm…"
            className={`w-full rounded-[10px] border border-border-light px-[15px] py-3 pr-11 text-[14.5px] text-ink focus:border-brand-ink focus:outline-none ${className ?? ""}`}
          />
          <CaretDownIcon
            size={16}
            className="pointer-events-none absolute right-[13px] top-1/2 -translate-y-1/2 text-stone-light"
          />
        </div>
      </label>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1.5 max-h-[280px] w-full overflow-y-auto rounded-[10px] border border-border-light bg-white shadow-lg"
        >
          {results.length === 0 ? (
            <div className="px-[15px] py-3 text-[13.5px] text-stone-light">Không tìm thấy ngân hàng phù hợp</div>
          ) : (
            results.map((bank, index) => (
              <button
                key={bank.code}
                id={`bank-option-${bank.code}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                onClick={() => selectBank(bank)}
                className={`flex w-full cursor-pointer flex-col items-start px-[15px] py-2.5 text-left hover:bg-neutral-bg ${
                  index === highlightedIndex ? "bg-neutral-bg" : ""
                }`}
              >
                <span className="text-[13.5px] font-semibold text-ink">{bank.shortName}</span>
                <span className="text-xs text-stone-light">{bank.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
