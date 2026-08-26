"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Field, Button, Alert } from "@/components/ui";
import { CccdUploadTiles, type CccdSlotKey } from "@/components/register/cccd-upload-tiles";

type LoadState = "loading" | "ready";

/**
 * CCCD — điều kiện thứ 2 để rút token (cùng với bank-info-form.tsx). Tái
 * dùng CccdUploadTiles từ luồng đăng ký. Load qua GET, xác minh qua POST
 * /api/profile/identity (multipart, OCR khớp ảnh tự động — không cần
 * admin duyệt tay, xem route đó).
 */
export function IdentityForm({ onVerified }: { onVerified?: (verified: boolean) => void }) {
  const [state, setState] = useState<LoadState>("loading");
  const [verified, setVerified] = useState(false);
  const [maskedNumber, setMaskedNumber] = useState<string | null>(null);
  const [cccd, setCccd] = useState("");
  const [files, setFiles] = useState<Record<CccdSlotKey, File | null>>({ front: null, back: null });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/identity")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setVerified(!!data.cccdVerified);
        setMaskedNumber(data.cccdNumberMasked ?? null);
        onVerified?.(!!data.cccdVerified);
      })
      .finally(() => {
        if (!cancelled) setState("ready");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cccdDigits = cccd.replace(/\D/g, "");
  const ready = cccdDigits.length === 12 && !!files.front && !!files.back && !pending;

  const onFile = (slot: CccdSlotKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setFiles((prev) => ({ ...prev, [slot]: file }));
  };

  const handleSubmit = async () => {
    if (!ready || !files.front || !files.back) return;
    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("cccd", cccdDigits);
    body.set("cccdFront", files.front);
    body.set("cccdBack", files.back);
    const res = await fetch("/api/profile/identity", { method: "POST", body });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Xác minh CCCD thất bại.");
      return;
    }
    setVerified(true);
    setMaskedNumber(data.cccdNumberMasked ?? null);
    onVerified?.(true);
  };

  if (state === "loading") {
    return <div className="text-[13.5px] text-stone-light">Đang tải…</div>;
  }

  if (verified) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-[#cfe8d9] bg-[#F4FAF6] px-[13px] py-2.5 text-[13px] font-medium text-[#2F7A4F]">
        <CheckCircleIcon weight="fill" size={16} /> Đã xác minh CCCD{maskedNumber ? ` · ${maskedNumber}` : ""}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Field
        label="Số căn cước công dân"
        type="text"
        inputMode="numeric"
        value={cccd}
        onChange={(e) => setCccd(e.target.value)}
        placeholder="12 chữ số"
        className="tracking-[1px]"
        hint="Nhập đúng 12 chữ số trên thẻ CCCD gắn chip"
      />
      <CccdUploadTiles files={files} onFile={onFile} />
      {error && <Alert tone="error">{error}</Alert>}
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={!ready}
        className="w-auto self-start px-6 py-[11px] text-sm font-semibold"
      >
        {pending ? "Đang xác minh…" : "Xác minh CCCD"}
      </Button>
    </div>
  );
}
