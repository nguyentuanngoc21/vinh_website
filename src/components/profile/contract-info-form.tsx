"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Field, Button, Alert } from "@/components/ui";

type LoadState = "loading" | "ready";

/**
 * Họ tên thật / Ngày sinh / Địa chỉ / Điện thoại — không phải thông tin
 * hiển thị công khai (khác Nickname/Bio ở khối "Chỉnh sửa thông tin cá
 * nhân"), mà là dữ kiện thật để tự điền "BÊN A" trong Hợp đồng khai thác
 * tác phẩm độc quyền khi tác giả mở/xác nhận hợp đồng đó (xem
 * agreement-document-viewer.tsx, GET /api/profile/contract-info). Lưu qua
 * cùng POST /api/profile/me với nickname/bio (không cooldown).
 *
 * real_name/phone có thể đã có sẵn từ lúc đăng ký (tùy chọn ở register-form)
 * — form này là nơi DUY NHẤT sửa lại được sau đó.
 */
export function ContractInfoForm() {
  const [state, setState] = useState<LoadState>("loading");
  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [saved, setSaved] = useState({ realName: "", phone: "", dateOfBirth: "", address: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const next = {
          realName: data.realName ?? "",
          phone: data.phone ?? "",
          dateOfBirth: data.dateOfBirth ?? "",
          address: data.address ?? "",
        };
        setRealName(next.realName);
        setPhone(next.phone);
        setDateOfBirth(next.dateOfBirth);
        setAddress(next.address);
        setSaved(next);
      })
      .finally(() => {
        if (!cancelled) setState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    realName.trim() !== saved.realName ||
    phone.trim() !== saved.phone ||
    dateOfBirth !== saved.dateOfBirth ||
    address.trim() !== saved.address;

  const handleSave = async () => {
    if (!dirty || pending) return;
    setPending(true);
    setError(null);
    setJustSaved(false);
    const res = await fetch("/api/profile/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        realName: realName.trim(),
        phone: phone.trim(),
        dateOfBirth,
        address: address.trim(),
      }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Lưu thông tin thất bại.");
      return;
    }
    const next = { realName: realName.trim(), phone: phone.trim(), dateOfBirth, address: address.trim() };
    setSaved(next);
    setJustSaved(true);
  };

  if (state === "loading") {
    return <div className="text-[13.5px] text-stone-light">Đang tải…</div>;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {justSaved && !dirty && (
        <div className="flex items-center gap-2 rounded-[10px] border border-[#cfe8d9] bg-[#F4FAF6] px-[13px] py-2.5 text-[13px] font-medium text-[#2F7A4F]">
          <CheckCircleIcon weight="fill" size={16} /> Đã lưu thông tin
        </div>
      )}
      <Field label="Họ và tên thật" value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="Nguyễn Văn A" />
      <Field
        label="Ngày sinh"
        type="date"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
      />
      <Field
        label="Số điện thoại"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="09xxxxxxxx"
      />
      <Field
        label="Địa chỉ"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố"
      />
      {error && <Alert tone="error">{error}</Alert>}
      <Button
        type="button"
        onClick={handleSave}
        disabled={!dirty || pending}
        className="w-auto self-start px-6 py-[11px] text-sm font-semibold"
      >
        {pending ? "Đang lưu…" : "Lưu thông tin"}
      </Button>
    </div>
  );
}
