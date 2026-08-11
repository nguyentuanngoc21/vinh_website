import { BankIcon } from "@phosphor-icons/react/dist/ssr";
import { BANK_INFO } from "@/lib/topup";

type BankTransferCardProps = {
  /** Formatted VND amount for this order, e.g. "120.000đ". */
  amount: string;
  /** Required transfer content so the top-up is matched automatically. */
  note: string;
};

const fieldClass = "bg-white px-[18px] py-3.5";
const labelClass = "text-[11.5px] tracking-[.6px] text-stone";
const valueClass = "mt-1 text-sm font-semibold text-ink";

/** Static bank-transfer instructions, only the amount/note vary per order. */
export function BankTransferCard({ amount, note }: BankTransferCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-cream">
      <div className="flex items-center gap-3.5 border-b border-[#F0E3C4] bg-cream-card px-[18px] py-3.5">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-brand-ink text-brand-gold-light">
          <BankIcon weight="fill" size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold text-ink">Chuyển khoản ngân hàng</div>
          <div className="mt-[3px] text-[12.5px] text-stone-dark">
            Hiện tại Vịnh chỉ hỗ trợ hình thức này. Token cộng trong 5–15 phút.
          </div>
        </div>
        <div className="shrink-0 text-[12.5px] font-semibold text-[#2C7453]">Miễn phí</div>
      </div>

      <div className="grid grid-cols-1 gap-px bg-[#f0efec] sm:grid-cols-2">
        <div className={fieldClass}>
          <div className={labelClass}>NGÂN HÀNG</div>
          <div className={valueClass}>{BANK_INFO.bank}</div>
        </div>
        <div className={fieldClass}>
          <div className={labelClass}>CHỦ TÀI KHOẢN</div>
          <div className={valueClass}>{BANK_INFO.holder}</div>
        </div>
        <div className={fieldClass}>
          <div className={labelClass}>SỐ TÀI KHOẢN</div>
          <div className="mt-1 text-base font-bold tracking-[.4px] text-brand-ink">
            {BANK_INFO.accountDisplay}
          </div>
        </div>
        <div className={fieldClass}>
          <div className={labelClass}>SỐ TIỀN</div>
          <div className="mt-1 text-base font-bold text-brand-ink">{amount}</div>
        </div>
      </div>

      <div className="border-t border-[#f0efec] bg-white px-[18px] py-3.5">
        <div className={labelClass}>NỘI DUNG CHUYỂN KHOẢN — BẮT BUỘC</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <div className="rounded-[9px] border border-dashed border-brand-gold-light bg-cream-card px-[13px] py-1.5 text-[15px] font-bold text-brand-gold-dark">
            {note}
          </div>
          <div className="text-[12.5px] text-stone">Ghi sai nội dung có thể khiến token cộng chậm.</div>
        </div>
      </div>
    </div>
  );
}
