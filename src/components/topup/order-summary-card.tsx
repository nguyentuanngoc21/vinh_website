import Link from "next/link";
import { BankIcon, CoinsIcon } from "@phosphor-icons/react/dist/ssr";

export type SummaryRow = { label: string; value: string; tone?: "success" | "muted" | "default" | "brand" };

type OrderSummaryCardProps = {
  rows: SummaryRow[];
  totalLabel: string;
  afterLabel: string;
  onPay: () => void;
};

const TONE_CLASS: Record<Required<SummaryRow>["tone"], string> = {
  success: "font-bold text-[#2C7453]",
  muted: "text-stone",
  default: "font-medium text-ink",
  brand: "font-bold text-brand-gold-dark",
};

/** Sticky order recap + the confirm-transfer CTA that opens the success modal. */
export function OrderSummaryCard({ rows, totalLabel, afterLabel, onPay }: OrderSummaryCardProps) {
  return (
    <div className="rounded-[18px] border border-cream bg-white p-6 shadow-[0_10px_30px_rgba(20,59,77,.06)]">
      <div className="text-[17px] font-bold text-brand-ink">Tóm tắt đơn nạp</div>
      <div className="mt-4 flex flex-col gap-[11px]">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-3.5">
            <div className="text-[13.5px] text-stone-dark">{row.label}</div>
            <div className={`whitespace-nowrap text-[13.5px] ${TONE_CLASS[row.tone ?? "default"]}`}>{row.value}</div>
          </div>
        ))}
      </div>

      <div className="my-4 h-px bg-[#f0efec]" />

      <div className="flex items-baseline justify-between gap-3.5">
        <div className="text-sm font-semibold text-ink">Tổng thanh toán</div>
        <div className="text-[22px] font-extrabold tracking-[-0.4px] text-brand-ink">{totalLabel}</div>
      </div>

      <div className="mt-3.5 flex items-center gap-2.5 rounded-xl border border-[#F0E3C4] bg-cream-card px-3.5 py-3">
        <CoinsIcon weight="fill" size={18} className="text-brand-gold" />
        <div className="text-[13px] leading-[1.5] text-stone-dark">
          Số dư sau khi nạp: <b className="font-bold text-brand-gold-dark">{afterLabel} token</b>
        </div>
      </div>

      <button
        type="button"
        onClick={onPay}
        className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-gold py-3.5 text-[15px] font-bold text-brand-ink transition-transform active:scale-[.99]"
      >
        <BankIcon weight="fill" size={17} /> Tôi đã chuyển khoản
      </button>
      <div className="mt-2.5 text-center text-[11.5px] leading-[1.6] text-stone">
        Bấm xác nhận sau khi chuyển khoản thành công. Bằng việc nạp, bạn đồng ý với{" "}
        <Link href="/" className="text-brand-gold-dark">
          Điều khoản nạp token
        </Link>
        . Token đã nạp không hoàn lại.
      </div>
    </div>
  );
}
