import { CoinsIcon } from "@phosphor-icons/react/dist/ssr";
import {
  CUSTOM_PACK_ID,
  customPackPrice,
  formatTokens,
  formatVnd,
  packTotalTokens,
  type TokenPack,
} from "@/lib/topup";

type PackGridProps = {
  packs: TokenPack[];
  selectedId: string;
  /** Tokens the custom tile currently previews — kept in sync with the modal's committed value. */
  customTokens: number;
  onSelectPack: (id: string) => void;
  onOpenCustom: () => void;
};

const cardBase =
  "relative cursor-pointer rounded-2xl p-[18px] pb-4 transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(20,59,77,.09)]";

/**
 * Selectable grid of token packs, plus a trailing "Khác" tile that opens the
 * custom-amount modal instead of selecting directly. Reused as-is if a
 * second top-up entry point (e.g. a paywall upsell) ever needs the same
 * picker — keep pack data and selection state in the parent, this component
 * only renders and reports clicks.
 */
export function PackGrid({ packs, selectedId, customTokens, onSelectPack, onOpenCustom }: PackGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {packs.map((pack) => {
        const isSelected = pack.id === selectedId;
        const tokens = packTotalTokens(pack);
        const unitPrice = Math.round(pack.price / tokens);
        return (
          <div
            key={pack.id}
            onClick={() => onSelectPack(pack.id)}
            className={`${cardBase} border ${isSelected ? "border-2 border-brand-ink bg-cream-card" : "border-cream bg-white"}`}
          >
            {pack.tag && (
              <div
                className={`absolute -top-[9px] left-4 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[.6px] text-white ${
                  isSelected ? "bg-brand-ink" : "bg-brand-gold-dark"
                }`}
              >
                {pack.tag}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <CoinsIcon weight="fill" size={18} className="text-brand-gold" />
              <div className="text-2xl font-extrabold tracking-[-0.5px] text-brand-ink">
                {formatTokens(tokens)}
              </div>
            </div>
            <div className="mt-[3px] text-[12.5px] text-stone">
              {pack.bonus ? `${formatTokens(pack.amount)} + ${formatTokens(pack.bonus)} thưởng` : "Gói khởi đầu"}
            </div>
            <div className="mt-3 text-base font-bold text-ink">{formatVnd(pack.price)}</div>
            <div className="mt-0.5 text-xs text-stone">{unitPrice}đ / token</div>
          </div>
        );
      })}

      <div
        onClick={onOpenCustom}
        className={`${cardBase} border border-dashed ${
          selectedId === CUSTOM_PACK_ID ? "border-2 border-brand-ink bg-cream-card" : "border-[#cfcac2] bg-white"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <CoinsIcon weight="fill" size={18} className="text-brand-gold" />
          <div className="text-2xl font-extrabold tracking-[-0.5px] text-brand-ink">Khác</div>
        </div>
        <div className="mt-[3px] text-[12.5px] text-stone">Tự chọn số token cần nạp</div>
        <div className="mt-3 text-base font-bold text-ink">
          {formatTokens(customTokens)} token · {formatVnd(customPackPrice(customTokens))}
        </div>
        <div className="mt-0.5 text-xs text-stone">Nhấn để điều chỉnh</div>
      </div>
    </div>
  );
}
