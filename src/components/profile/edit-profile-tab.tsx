"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CoinsIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { transactionTypeLabel } from "@/lib/profile";
import { Field, Button, Alert } from "@/components/ui";
import { BankInfoForm } from "@/components/profile/bank-info-form";
import { IdentityForm } from "@/components/profile/identity-form";
import { ContractInfoForm } from "@/components/profile/contract-info-form";
import { useRole } from "@/lib/role";
import type { TransactionType } from "@/lib/supabase/types";

type TransactionEntry = { id: string; type: TransactionType; amount: number; created_at: string };

type LoadState = "loading" | "ready";

type EditProfileTabProps = {
  /** Bắn lên profile-page.tsx sau khi lưu nickname thành công — để
   * ProfileHeader (hiển thị trên mọi tab, không chỉ tab này) cập nhật
   * theo ngay, không cần load lại trang. */
  onNicknameSaved?: (nickname: string) => void;
};

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function EditProfileTab({ onNicknameSaved }: EditProfileTabProps) {
  const { updateSessionName } = useRole();

  // Cả 2 điều kiện đều bắt đầu unknown (null) cho tới khi form con tương
  // ứng tải xong GET của nó — chỉ hiện banner "đủ điều kiện"/"thiếu" sau
  // khi cả hai đã biết, tránh nháy sai trạng thái lúc đầu.
  const [bankSaved, setBankSaved] = useState<boolean | null>(null);
  const [cccdVerified, setCccdVerified] = useState<boolean | null>(null);
  const eligibility =
    bankSaved === null || cccdVerified === null ? null : bankSaved && cccdVerified;

  const [state, setState] = useState<LoadState>("loading");
  const [nickname, setNickname] = useState("");
  const [savedNickname, setSavedNickname] = useState("");
  const [bio, setBio] = useState("");
  const [savedBio, setSavedBio] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<TransactionEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/profile/me").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/wallet/balance").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/wallet/transactions?limit=5").then((res) => (res.ok ? res.json() : null)),
    ]).then(([me, balance, txns]) => {
      if (cancelled) return;
      if (me) {
        setNickname(me.nickname ?? "");
        setSavedNickname(me.nickname ?? "");
        setBio(me.bio ?? "");
        setSavedBio(me.bio ?? "");
      }
      if (balance) setTokenBalance(balance.available ?? null);
      if (txns) setTransactions(txns.entries ?? []);
      setState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = nickname.trim() !== savedNickname || bio !== savedBio;
  const ready = nickname.trim().length > 0 && dirty && !pending;

  const handleSave = async () => {
    if (!ready) return;
    setPending(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/profile/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nickname.trim(), bio }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Lưu thông tin thất bại.");
      return;
    }
    const newNickname = data.nickname ?? nickname.trim();
    setSavedNickname(newNickname);
    setSavedBio(bio);
    setSaved(true);
    updateSessionName(newNickname);
    onNicknameSaved?.(newNickname);
  };

  const handleCancel = () => {
    setNickname(savedNickname);
    setBio(savedBio);
    setError(null);
    setSaved(false);
  };

  return (
    <div className="grid grid-cols-1 gap-[26px] px-4 pb-[60px] pt-[26px] sm:px-8 lg:grid-cols-[1.4fr_.9fr] lg:px-11">
      <div className="flex flex-col gap-[26px]">
        {eligibility !== null && (
          <div
            className={
              "flex items-center gap-2.5 rounded-[14px] border px-[18px] py-3.5 text-[13.5px] font-medium " +
              (eligibility
                ? "border-[#cfe8d9] bg-[#F4FAF6] text-[#2F7A4F]"
                : "border-[#F0E3C4] bg-cream-card text-stone-dark")
            }
          >
            {eligibility ? (
              <>
                <CheckCircleIcon weight="fill" size={18} /> Đủ điều kiện rút token
              </>
            ) : (
              <>
                <WarningCircleIcon weight="fill" size={18} color="var(--color-brand-gold-dark)" />
                Cần hoàn tất CCCD và ngân hàng thụ hưởng bên dưới để rút token
              </>
            )}
          </div>
        )}

        <div className="rounded-[18px] border border-cream p-[26px]">
          <div className="text-[19px] font-bold text-brand-ink">Chỉnh sửa thông tin cá nhân</div>
          <div className="mt-1.5 text-[13.5px] leading-[1.6] text-stone-dark">
            Tên hiển thị và mô tả sẽ xuất hiện trên trang tác giả cùng mọi bình luận của bạn.
          </div>
          {state === "loading" ? (
            <div className="mt-[22px] text-[13.5px] text-stone-light">Đang tải…</div>
          ) : (
            <div className="mt-[22px] flex flex-col gap-[18px]">
              <Field
                label="Nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="px-3.5 py-3 text-sm"
                hint="Có thể đổi 1 lần mỗi 30 ngày."
              />
              <label className="block">
                <div className="mb-2 text-[13px] font-semibold text-ink">Mô tả về bản thân</div>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 280))}
                  rows={5}
                  className="w-full resize-y rounded-xl border border-cream px-3.5 py-3 text-sm leading-[1.65] outline-none focus:border-brand-gold"
                />
                <div className="mt-1.5 text-xs text-stone">{bio.length}/280 ký tự</div>
              </label>
              {saved && !dirty && (
                <div className="text-[13px] font-medium text-[#2F7A4F]">Đã lưu thay đổi.</div>
              )}
              {error && <Alert tone="error">{error}</Alert>}
              <div className="flex gap-2.5">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={!ready}
                  className="w-auto px-6 py-[11px] text-sm font-semibold"
                >
                  {pending ? "Đang lưu…" : "Lưu thay đổi"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCancel}
                  disabled={!dirty || pending}
                  className="w-auto px-[22px] py-[11px] text-sm font-medium"
                >
                  Hủy
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[18px] border border-cream p-[26px]">
          <div className="text-[19px] font-bold text-brand-ink">Thông tin hợp đồng</div>
          <div className="mt-1.5 text-[13.5px] leading-[1.6] text-stone-dark">
            Không hiển thị công khai — dùng để tự điền thông tin của bạn (Bên A) khi ký các hợp đồng với
            Vịnh, ví dụ Hợp đồng khai thác tác phẩm độc quyền.
          </div>
          <div className="mt-[22px]">
            <ContractInfoForm />
          </div>
        </div>

        <div className="rounded-[18px] border border-cream p-[26px]">
          <div className="text-[19px] font-bold text-brand-ink">Ngân hàng thụ hưởng</div>
          <div className="mt-1.5 text-[13.5px] leading-[1.6] text-stone-dark">
            Dùng để nhận tiền khi rút token — nhập đúng thông tin, bạn chịu trách nhiệm nếu sai.
          </div>
          <div className="mt-[22px]">
            <BankInfoForm onSaved={setBankSaved} />
          </div>
        </div>

        <div className="rounded-[18px] border border-cream p-[26px]">
          <div className="text-[19px] font-bold text-brand-ink">Căn cước công dân</div>
          <div className="mt-1.5 text-[13.5px] leading-[1.6] text-stone-dark">
            Xác minh CCCD để mở khoá tính năng rút token — hệ thống tự đối chiếu số bạn nhập với ảnh
            tải lên.
          </div>
          <div className="mt-[22px]">
            <IdentityForm onVerified={setCccdVerified} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-[18px] bg-brand-ink-dark p-6 text-white">
          <div className="text-[11.5px] font-semibold tracking-[1.3px] text-brand-gold-light">
            SỐ DƯ TOKEN
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <div className="text-[40px] font-extrabold tracking-[-1px] text-brand-gold-light">
              {tokenBalance === null ? "…" : tokenBalance.toLocaleString("vi-VN")}
            </div>
            <div className="text-sm font-medium text-sidebar-text-dim-2">token</div>
          </div>
          <div className="mt-2.5 text-[13px] leading-[1.6] text-sidebar-text-dim-2">
            Dùng để mở chương sớm, tặng tác giả và mua ảnh bìa trong thư viện thiết kế.
          </div>
          <Link
            href="/ca-nhan/nap-token"
            className="mt-4 flex w-auto items-center justify-center gap-2 rounded-[10px] bg-brand-gold px-5 py-2.5 text-[13.5px] font-semibold text-brand-ink no-underline transition-transform active:scale-[.99]"
          >
            <CoinsIcon weight="fill" size={16} /> Nạp thêm token
          </Link>
        </div>
        <div className="rounded-[18px] border border-cream p-5">
          <div className="mb-3 text-[13px] font-semibold text-ink">
            Hoạt động token gần đây
          </div>
          {transactions.length === 0 ? (
            <div className="py-2.5 text-[13px] text-stone-light">Chưa có giao dịch nào.</div>
          ) : (
            transactions.map((txn) => (
              <div
                key={txn.id}
                className="flex justify-between gap-3 border-t border-[#f5f4f2] py-2.5"
              >
                <div className="text-[13px] text-stone-dark">
                  {transactionTypeLabel(txn.type)} · {formatShortDate(txn.created_at)}
                </div>
                <div
                  style={{ color: txn.amount >= 0 ? "#2F7A4F" : "#B02A37" }}
                  className="text-[13px] font-bold"
                >
                  {txn.amount >= 0 ? "+" : ""}
                  {txn.amount.toLocaleString("vi-VN")}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
