import { DEFAULT_TOKEN_BALANCE_NUM } from "@/lib/profile";

// Wallet balance the top-up flow starts from. Re-exported (rather than
// imported directly from lib/profile in every component) so this file stays
// the single place other topup code points to — if the wallet ever gets a
// real backend, this is the one line that changes to a fetched value.
export const WALLET_BALANCE = DEFAULT_TOKEN_BALANCE_NUM;

export type TokenPack = {
  id: string;
  amount: number;
  bonus: number;
  price: number; // VND
  tag?: string;
};

// Ordered cheapest → best value; PackGrid renders a "Khác" (custom) tile
// after these using CUSTOM_PACK_ID, it isn't part of this list.
export const TOKEN_PACKS: TokenPack[] = [
  { id: "p100", amount: 100, bonus: 0, price: 20_000 },
  { id: "p300", amount: 300, bonus: 15, price: 60_000 },
  { id: "p600", amount: 600, bonus: 60, price: 120_000, tag: "Phổ biến" },
  { id: "p1200", amount: 1200, bonus: 180, price: 240_000 },
  { id: "p3000", amount: 3000, bonus: 600, price: 600_000, tag: "Lợi nhất" },
];

export const DEFAULT_PACK_ID = "p600";
export const CUSTOM_PACK_ID = "custom";

export const CUSTOM_UNIT_PRICE = 200; // đ / token
export const MIN_CUSTOM_TOKENS = 50;
export const DEFAULT_CUSTOM_TOKENS = 800;
export const QUICK_CUSTOM_AMOUNTS = [200, 500, 800, 1500, 2500, 5000];

// code -> discount fraction of the pack price
export const PROMO_CODES: Record<string, number> = { VINH10: 0.1, VINH20: 0.2 };

export const BANK_INFO = {
  bank: "Vietcombank — CN Hà Nội",
  holder: "CONG TY TNHH VINH MEDIA",
  accountDisplay: "0071 0004 88 269",
  // VietQR wants the BIN + raw account number, no spaces.
  qrBin: "970436",
  qrAccount: "0071000488269",
};

export type TopupHistoryEntry = { title: string; meta: string; amount: string };

export const TOPUP_HISTORY: TopupHistoryEntry[] = [
  { title: "Gói 600 token", meta: "02/08/2026 · Chuyển khoản Vietcombank", amount: "+660" },
  { title: "Gói 300 token", meta: "14/07/2026 · Chuyển khoản Vietcombank", amount: "+315" },
  { title: "Gói 100 token", meta: "28/06/2026 · Chuyển khoản Vietcombank", amount: "+100" },
];

export function formatVnd(amount: number): string {
  return amount.toLocaleString("vi-VN") + "đ";
}

export function formatTokens(amount: number): string {
  return amount.toLocaleString("vi-VN");
}

export function clampCustomTokens(qty: number): number {
  return Math.max(MIN_CUSTOM_TOKENS, Math.trunc(qty) || 0);
}

export function customPackPrice(qty: number): number {
  return clampCustomTokens(qty) * CUSTOM_UNIT_PRICE;
}

/** Total tokens a pack credits, including any bonus. */
export function packTotalTokens(pack: TokenPack): number {
  return pack.amount + pack.bonus;
}

/** Builds an ad-hoc pack for whatever quantity the custom modal is set to. */
export function buildCustomPack(qty: number): TokenPack {
  const amount = clampCustomTokens(qty);
  return { id: CUSTOM_PACK_ID, amount, bonus: 0, price: customPackPrice(amount) };
}

/** Content required by the bank for the transfer to be matched automatically. */
export function transferNote(tokens: number): string {
  return `VINH MINHKHOI ${formatTokens(tokens)}`;
}

export function qrImageUrl(totalVnd: number, tokens: number): string {
  const params = new URLSearchParams({
    amount: String(totalVnd),
    addInfo: transferNote(tokens),
  });
  return `https://img.vietqr.io/image/${BANK_INFO.qrBin}-${BANK_INFO.qrAccount}-qronly.png?${params.toString()}`;
}

export type PromoMessage = { tone: "success" | "error"; text: string };

/** Looks a promo code up and returns the message + discount fraction to apply. */
export function resolvePromoCode(rawCode: string): { discount: number; message: PromoMessage } {
  const code = rawCode.trim().toUpperCase();
  const discount = PROMO_CODES[code];
  if (!code) {
    return { discount: 0, message: { tone: "error", text: "Vui lòng nhập mã khuyến mãi." } };
  }
  if (!discount) {
    return { discount: 0, message: { tone: "error", text: "Mã không hợp lệ hoặc đã hết hạn." } };
  }
  return {
    discount,
    message: { tone: "success", text: `Đã áp dụng mã ${code} — giảm ${Math.round(discount * 100)}%.` },
  };
}
