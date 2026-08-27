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
 *
 * Tên chủ tài khoản do người dùng TỰ NHẬP, KHÔNG mặc định/ép = Tên thật
 * đã xác minh — chủ tài khoản có thể không phải chính người lập hồ sơ
 * (mượn tài khoản người thân khi chưa có thẻ), và nhiều ngân hàng in tên
 * không dấu nên so khớp cứng với real_name có dấu sẽ sai dù đúng người.
 * Thông tin này do người dùng khai, sai thì trách nhiệm thuộc về họ.
 */
export function BankInfoForm({ onSaved }: { onSaved?: (saved: boolean) => void }) {
  const [state, setState] = useState<LoadState>("loading");
  const [bank, setBank] = useState<VietnamBank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
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
        const isSaved = !!found && !!data.bankAccountNumber && !!data.bankAccountName;
        setBank(found ?? null);
        setAccountNumber(data.bankAccountNumber ?? "");
        setAccountName(data.bankAccountName ?? "");
        setSaved(isSaved);
        onSaved?.(isSaved);
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
  const ready =
    !!bank && accountDigits.length >= 6 && accountDigits.length <= 19 && accountName.trim().length > 0 && !pending;

  const handleSave = async () => {
    if (!ready || !bank) return;
    setPending(true);
    setError(null);
    const res = await fetch("/api/profile/bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankCode: bank.code,
        bankAccountNumber: accountDigits,
        bankAccountName: accountName.trim(),
      }),
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
        label="Tên chủ tài khoản"
        type="text"
        value={accountName}
        onChange={(e) => {
          setAccountName(e.target.value);
          setSaved(false);
        }}
        placeholder="Đúng như in trên thẻ/sao kê ngân hàng"
        hint="Ghi đúng tên chủ tài khoản — có thể khác Tên thật trên hồ sơ (ví dụ mượn tài khoản người thân, hoặc ngân hàng ghi tên không dấu). Bạn chịu trách nhiệm nếu thông tin sai."
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
        hint="Chỉ gồm chữ số."
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
