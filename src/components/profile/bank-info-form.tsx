"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { BankSelect, Field, Button, Alert } from "@/components/ui";
import { findBankByCode, type VietnamBank } from "@/lib/banks";

type LoadState = "loading" | "ready";

/**
 * Ngân hàng thụ hưởng — 1 trong 2 điều kiện để rút token (cùng với
 * identity-form.tsx). Load/lưu qua GET|POST /api/profile/bank, theo đúng
 * pattern src/app/api/wallet/balance/route.ts (service-role +
 * getAuthedUserId()).
 */
export function BankInfoForm({ onSaved }: { onSaved?: (saved: boolean) => void }) {
  const [state, setState] = useState<LoadState>("loading");
  const [bank, setBank] = useState<VietnamBank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/bank")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const found = data.bankCode ? findBankByCode(data.bankCode) : null;
        setBank(found ?? null);
        setAccountNumber(data.bankAccountNumber ?? "");
        setSaved(!!found && !!data.bankAccountNumber);
        onSaved?.(!!found && !!data.bankAccountNumber);
      })
      .finally(() => {
        if (!cancelled) setState("ready");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accountDigits = accountNumber.replace(/\D/g, "");
  const ready = !!bank && accountDigits.length >= 6 && accountDigits.length <= 19 && !pending;

  const handleSave = async () => {
    if (!ready || !bank) return;
    setPending(true);
    setError(null);
    const res = await fetch("/api/profile/bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankCode: bank.code, bankAccountNumber: accountDigits }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Lưu thông tin ngân hàng thất bại.");
      return;
    }
    setSaved(true);
    onSaved?.(true);
  };

  if (state === "loading") {
    return <div className="text-[13.5px] text-stone-light">Đang tải…</div>;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {saved && (
        <div className="flex items-center gap-2 rounded-[10px] border border-[#cfe8d9] bg-[#F4FAF6] px-[13px] py-2.5 text-[13px] font-medium text-[#2F7A4F]">
          <CheckCircleIcon weight="fill" size={16} /> Đã lưu thông tin ngân hàng
        </div>
      )}
      <BankSelect
        value={bank}
        onChange={(b) => {
          setBank(b);
          setSaved(false);
        }}
      />
      <Field
        label="Số tài khoản"
        type="text"
        inputMode="numeric"
        value={accountNumber}
        onChange={(e) => {
          setAccountNumber(e.target.value);
          setSaved(false);
        }}
        placeholder="Nhập số tài khoản"
        className="tracking-[1px]"
        hint="Chỉ gồm chữ số, tên chủ tài khoản mặc định là Tên thật đã xác minh trên hồ sơ."
      />
      {error && <Alert tone="error">{error}</Alert>}
      <Button
        type="button"
        onClick={handleSave}
        disabled={!ready}
        className="w-auto self-start px-6 py-[11px] text-sm font-semibold"
      >
        {pending ? "Đang lưu…" : "Lưu thông tin ngân hàng"}
      </Button>
    </div>
  );
}
