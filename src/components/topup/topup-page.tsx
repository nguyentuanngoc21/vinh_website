"use client";

import { useState, type ReactNode } from "react";
import { CoinsIcon } from "@phosphor-icons/react/dist/ssr";
import { Breadcrumbs } from "@/components/ui";
import { PackGrid } from "@/components/topup/pack-grid";
import { BankTransferCard } from "@/components/topup/bank-transfer-card";
import { PromoCodeForm } from "@/components/topup/promo-code-form";
import { QrTransferCard } from "@/components/topup/qr-transfer-card";
import { OrderSummaryCard, type SummaryRow } from "@/components/topup/order-summary-card";
import { TopupHistoryCard } from "@/components/topup/topup-history-card";
import { CustomAmountModal } from "@/components/topup/custom-amount-modal";
import { SuccessModal } from "@/components/topup/success-modal";
import {
  buildCustomPack,
  clampCustomTokens,
  CUSTOM_PACK_ID,
  DEFAULT_CUSTOM_TOKENS,
  DEFAULT_PACK_ID,
  formatTokens,
  formatVnd,
  MIN_CUSTOM_TOKENS,
  packTotalTokens,
  qrImageUrl,
  QUICK_CUSTOM_AMOUNTS,
  resolvePromoCode,
  TOKEN_PACKS,
  TOPUP_HISTORY,
  transferNote,
  WALLET_BALANCE,
  type PromoMessage,
} from "@/lib/topup";

const BREADCRUMB_ITEMS = [
  { label: "Cá nhân", href: "/ca-nhan" },
  { label: "Thông tin cá nhân", href: "/ca-nhan" },
  { label: "Nạp token" },
];

export function TopupPage() {
  const [selectedPackId, setSelectedPackId] = useState(DEFAULT_PACK_ID);
  const [customTokens, setCustomTokens] = useState(DEFAULT_CUSTOM_TOKENS);
  const [customDraft, setCustomDraft] = useState(String(DEFAULT_CUSTOM_TOKENS));
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoMessage, setPromoMessage] = useState<PromoMessage | null>(null);

  const selectedPack =
    selectedPackId === CUSTOM_PACK_ID
      ? buildCustomPack(customTokens)
      : TOKEN_PACKS.find((pack) => pack.id === selectedPackId) ?? TOKEN_PACKS[0];

  const tokens = packTotalTokens(selectedPack);
  const discount = appliedPromo ? Math.round(selectedPack.price * appliedPromo.discount) : 0;
  const total = selectedPack.price - discount;
  const note = transferNote(tokens);
  const balanceAfter = WALLET_BALANCE + tokens;

  const draftQty = parseInt(customDraft, 10) || 0;
  const isDraftValid = draftQty >= MIN_CUSTOM_TOKENS;
  const previewPack = buildCustomPack(draftQty);

  const summaryRows: SummaryRow[] = [
    {
      label: `${selectedPackId === CUSTOM_PACK_ID ? "Tuỳ chọn" : "Gói"} ${formatTokens(selectedPack.amount)} token`,
      value: formatVnd(selectedPack.price),
    },
    {
      label: "Token thưởng",
      value: selectedPack.bonus ? `+${formatTokens(selectedPack.bonus)}` : "—",
      tone: selectedPack.bonus ? "success" : "muted",
    },
    { label: "Phí giao dịch", value: "Miễn phí", tone: "success" },
  ];
  if (discount > 0 && appliedPromo) {
    summaryRows.push({
      label: `Khuyến mãi ${appliedPromo.code}`,
      value: `−${formatVnd(discount)}`,
      tone: "success",
    });
  }
  summaryRows.push({ label: "Tổng token nhận", value: `${formatTokens(tokens)} token`, tone: "brand" });

  const applyPromo = () => {
    const { discount: nextDiscount, message } = resolvePromoCode(promoInput);
    setAppliedPromo(nextDiscount ? { code: promoInput.trim().toUpperCase(), discount: nextDiscount } : null);
    setPromoMessage(message);
  };

  const openCustomModal = () => {
    setCustomDraft(String(customTokens));
    setShowCustomModal(true);
  };

  const stepCustomDraft = (delta: number) => {
    setCustomDraft(String(Math.max(MIN_CUSTOM_TOKENS, (parseInt(customDraft, 10) || 0) + delta)));
  };

  const confirmCustomModal = () => {
    setCustomTokens(clampCustomTokens(draftQty));
    setSelectedPackId(CUSTOM_PACK_ID);
    setShowCustomModal(false);
  };

  return (
    <>
      <div className="px-11 pt-[22px]">
        <Breadcrumbs items={BREADCRUMB_ITEMS} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 px-11 pt-[18px]">
        <div>
          <div className="font-[family-name:var(--font-lora)] text-[30px] font-bold leading-[1.2] text-brand-ink">
            Nạp thêm token
          </div>
          <div className="mt-1.5 max-w-[560px] text-sm leading-[1.6] text-stone-dark">
            Token dùng để mở chương sớm, tặng tác giả và mua ảnh bìa trong thư viện thiết kế. Token không có
            hạn sử dụng.
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 rounded-2xl bg-brand-ink-dark px-[18px] py-3">
          <CoinsIcon weight="fill" size={22} className="text-brand-gold-light" />
          <div>
            <div className="text-[10.5px] font-semibold tracking-[1.2px] text-sidebar-text-dim-2">
              SỐ DƯ HIỆN TẠI
            </div>
            <div className="mt-0.5 text-xl font-extrabold text-brand-gold-light">
              {formatTokens(WALLET_BALANCE)} token
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[26px] px-11 py-[26px] pb-16 lg:grid-cols-[1.55fr_.95fr]">
        <div className="flex flex-col gap-[26px]">
          <TopupStep step={1} title="Chọn gói token">
            <PackGrid
              packs={TOKEN_PACKS}
              selectedId={selectedPackId}
              customTokens={customTokens}
              onSelectPack={setSelectedPackId}
              onOpenCustom={openCustomModal}
            />
          </TopupStep>

          <TopupStep step={2} title="Chuyển khoản ngân hàng">
            <BankTransferCard amount={formatVnd(total)} note={note} />
          </TopupStep>

          <TopupStep step={3} title="Mã khuyến mãi">
            <PromoCodeForm value={promoInput} onChange={setPromoInput} onApply={applyPromo} message={promoMessage} />
          </TopupStep>

          <QrTransferCard
            show={showQr}
            onShow={() => setShowQr(true)}
            onHide={() => setShowQr(false)}
            qrSrc={qrImageUrl(total, tokens)}
            amount={formatVnd(total)}
            tokens={formatTokens(tokens)}
            note={note}
          />
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-[132px] lg:self-start">
          <OrderSummaryCard
            rows={summaryRows}
            totalLabel={formatVnd(total)}
            afterLabel={formatTokens(balanceAfter)}
            onPay={() => setShowSuccess(true)}
          />
          <TopupHistoryCard history={TOPUP_HISTORY} />
          <div className="flex gap-2.5 rounded-2xl bg-[#f7f7f7] px-4 py-3.5">
            <div className="text-[12.5px] leading-[1.6] text-stone-dark">
              Chuyển khoản chưa được cộng token sau 30 phút?{" "}
              <a href="/ket-noi" className="text-brand-gold-dark">
                Liên hệ CSKH
              </a>{" "}
              kèm ảnh biên lai.
            </div>
          </div>
        </div>
      </div>

      <CustomAmountModal
        open={showCustomModal}
        draft={customDraft}
        onDraftChange={setCustomDraft}
        onStep={stepCustomDraft}
        quickAmounts={QUICK_CUSTOM_AMOUNTS}
        onPickQuick={(amount) => setCustomDraft(String(amount))}
        previewPack={previewPack}
        isValid={isDraftValid}
        hint={isDraftValid ? "Đơn giá 200đ / token · tối thiểu 50 token." : "Số lượng tối thiểu là 50 token."}
        onClose={() => setShowCustomModal(false)}
        onConfirm={confirmCustomModal}
      />

      <SuccessModal
        open={showSuccess}
        message={`${formatTokens(tokens)} token đã được cộng vào tài khoản. Số dư mới của bạn là ${formatTokens(
          balanceAfter
        )} token.`}
        onClose={() => setShowSuccess(false)}
      />
    </>
  );
}

/** Numbered step heading shared by the three order-form sections. */
function TopupStep({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5">
        <div className="flex h-[22px] w-[22px] shrink-0 translate-y-[3px] items-center justify-center rounded-full bg-brand-ink text-xs font-bold text-brand-gold-light">
          {step}
        </div>
        <div className="text-[17px] font-bold text-brand-ink">{title}</div>
      </div>
      <div className="mt-3.5">{children}</div>
    </div>
  );
}
