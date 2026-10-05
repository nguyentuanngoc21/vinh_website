"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon, PencilSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { Field, Button, Alert, Skeleton } from "@/components/ui";
import { CccdUploadTiles, type CccdSlotKey } from "@/components/register/cccd-upload-tiles";

type LoadState = "loading" | "ready";

export type IdentityStatus = { verified: boolean; issuedAt: string | null };

function formatIsoDateVi(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/**
 * CCCD — điều kiện thứ 2 để rút token (cùng với bank-info-form.tsx). Tái
 * dùng CccdUploadTiles từ luồng đăng ký. Load qua GET, xác minh qua POST
 * /api/profile/identity (multipart, OCR khớp ảnh tự động — không cần
 * admin duyệt tay, xem route đó).
 *
 * Đã xác minh (kể cả xác minh ngay lúc đăng ký, xem registration.ts) thì
 * chỉ hiện thông tin đã lưu; muốn sửa phải bấm icon bút. Sửa = xác minh
 * lại từ đầu: nhập số + tải ảnh CCCD MỚI NHẤT, route OCR đối chiếu lại —
 * không khớp thì route không ghi gì, thông tin cũ giữ nguyên.
 */
export function IdentityForm({ onStatusChange }: { onStatusChange?: (status: IdentityStatus) => void }) {
  const [state, setState] = useState<LoadState>("loading");
  const [verified, setVerified] = useState(false);
  const [editing, setEditing] = useState(false);
  const [maskedNumber, setMaskedNumber] = useState<string | null>(null);
  const [savedIssuedAt, setSavedIssuedAt] = useState<string | null>(null);
  const [cccd, setCccd] = useState("");
  // "Cấp ngày" — không bắt buộc để xác minh CCCD, chỉ cần để tự điền Hợp
  // đồng khai thác tác phẩm độc quyền sau này (xem contract-info-form.tsx).
  const [cccdIssuedAt, setCccdIssuedAt] = useState("");
  const [files, setFiles] = useState<Record<CccdSlotKey, File | null>>({ front: null, back: null });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ngoại lệ "chỉ bổ sung ngày cấp" — không cần ảnh, xem PATCH
  // /api/profile/identity. Chỉ hiện khi đã xác minh mà ngày cấp đang trống.
  const [issuedAtDraft, setIssuedAtDraft] = useState("");
  const [issuedAtPending, setIssuedAtPending] = useState(false);
  const [issuedAtError, setIssuedAtError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/identity")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const issuedAt = data.cccdIssuedAt ?? null;
        setVerified(!!data.cccdVerified);
        setMaskedNumber(data.cccdNumberMasked ?? null);
        setSavedIssuedAt(issuedAt);
        onStatusChange?.({ verified: !!data.cccdVerified, issuedAt });
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

  // Nhận File đã nén sẵn từ CccdUploadTiles (xem compress-image.ts) — không
  // còn nhận ChangeEvent thô ở đây nữa.
  const onFile = (slot: CccdSlotKey) => (file: File | null) => {
    setFiles((prev) => ({ ...prev, [slot]: file }));
  };

  const resetDraft = () => {
    setCccd("");
    setFiles({ front: null, back: null });
    setError(null);
  };

  const startEditing = () => {
    resetDraft();
    setCccdIssuedAt(savedIssuedAt ?? "");
    setEditing(true);
  };

  const cancelEditing = () => {
    resetDraft();
    setEditing(false);
  };

  const handleSubmit = async () => {
    if (!ready || !files.front || !files.back) return;
    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("cccd", cccdDigits);
    if (cccdIssuedAt) body.set("cccdIssuedAt", cccdIssuedAt);
    body.set("cccdFront", files.front);
    body.set("cccdBack", files.back);
    const res = await fetch("/api/profile/identity", { method: "POST", body });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Xác minh CCCD thất bại.");
      return;
    }
    const issuedAt = data.cccdIssuedAt ?? null;
    setVerified(true);
    setEditing(false);
    setMaskedNumber(data.cccdNumberMasked ?? null);
    setSavedIssuedAt(issuedAt);
    resetDraft();
    onStatusChange?.({ verified: true, issuedAt });
  };

  const handleAddIssuedAt = async () => {
    if (!issuedAtDraft || issuedAtPending) return;
    setIssuedAtPending(true);
    setIssuedAtError(null);
    const res = await fetch("/api/profile/identity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cccdIssuedAt: issuedAtDraft }),
    });
    const data = await res.json().catch(() => null);
    setIssuedAtPending(false);
    if (!res.ok) {
      setIssuedAtError((data && data.error) || "Lưu ngày cấp thất bại.");
      return;
    }
    const issuedAt = data.cccdIssuedAt ?? issuedAtDraft;
    setSavedIssuedAt(issuedAt);
    setIssuedAtDraft("");
    onStatusChange?.({ verified: true, issuedAt });
  };

  if (state === "loading") {
    return (
      <div className="flex flex-col gap-3.5">
        <Skeleton className="h-11 w-full rounded-[10px]" />
        <Skeleton className="h-11 w-full rounded-[10px]" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-11 w-40 rounded-[10px]" />
      </div>
    );
  }

  if (verified && !editing) {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="flex items-start gap-3 rounded-[10px] border border-[#cfe8d9] dark:border-success-form-border bg-success-form-bg px-[13px] py-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13px]">
            <div className="flex items-center gap-2 font-medium text-success-form">
              <CheckCircleIcon weight="fill" size={16} className="shrink-0" />
              <span>Đã xác minh CCCD{maskedNumber ? ` · ${maskedNumber}` : ""}</span>
            </div>
            <div className="pl-6 text-stone-dark">
              Ngày cấp: {savedIssuedAt ? formatIsoDateVi(savedIssuedAt) : <span className="italic">chưa có</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={startEditing}
            aria-label="Sửa thông tin CCCD"
            title="Sửa thông tin CCCD"
            className="-m-1.5 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-brand-ink hover:bg-cream-card"
          >
            <PencilSimpleIcon size={18} />
          </button>
        </div>
        {!savedIssuedAt && (
          <div className="flex flex-col gap-2.5">
            <Field
              label="Bổ sung ngày cấp CCCD"
              type="date"
              value={issuedAtDraft}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setIssuedAtDraft(e.target.value)}
              hint="Chỉ thêm ngày cấp còn thiếu — không cần tải lại ảnh. Muốn đổi số CCCD, bấm biểu tượng bút."
            />
            {issuedAtError && <Alert tone="error">{issuedAtError}</Alert>}
            <Button
              type="button"
              onClick={handleAddIssuedAt}
              disabled={!issuedAtDraft || issuedAtPending}
              fullWidth={false}
              className="self-start px-6 py-[11px] text-sm font-semibold"
            >
              {issuedAtPending ? "Đang lưu…" : "Lưu ngày cấp"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {editing && (
        <Alert tone="info">
          Nhập lại số CCCD và tải ảnh hai mặt CCCD mới nhất — hệ thống đối chiếu số với ảnh, không khớp
          thì thông tin cũ được giữ nguyên.
        </Alert>
      )}
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
      <Field
        label="Ngày cấp (nếu có)"
        type="date"
        value={cccdIssuedAt}
        onChange={(e) => setCccdIssuedAt(e.target.value)}
        hint="Dùng để tự điền hợp đồng khi cần — có thể bỏ trống."
      />
      <CccdUploadTiles files={files} onFile={onFile} />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!ready}
          fullWidth={false}
          className="px-6 py-[11px] text-sm font-semibold"
        >
          {pending ? "Đang xác minh…" : editing ? "Xác minh & lưu" : "Xác minh CCCD"}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="ghost"
            onClick={cancelEditing}
            disabled={pending}
            fullWidth={false}
            className="px-6 py-[11px] text-sm font-semibold"
          >
            Huỷ
          </Button>
        )}
      </div>
    </div>
  );
}
