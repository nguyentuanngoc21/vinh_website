import Image from "next/image";
import { QrCodeIcon, XIcon } from "@phosphor-icons/react/dist/ssr";

type QrTransferCardProps = {
  show: boolean;
  onShow: () => void;
  onHide: () => void;
  qrSrc: string;
  amount: string;
  tokens: string;
  note: string;
};

/**
 * Collapsed by default (just a CTA) — expands into the actual QR + a summary
 * of what it encodes once the reader asks to see it, so the page doesn't pay
 * for a QR image request until it's actually wanted.
 */
export function QrTransferCard({ show, onShow, onHide, qrSrc, amount, tokens, note }: QrTransferCardProps) {
  if (!show) {
    return (
      <div className="rounded-2xl border border-brand-ink bg-brand-ink">
        <button
          type="button"
          onClick={onShow}
          className="flex w-full cursor-pointer items-center justify-center gap-[9px] p-3.5 text-[15px] font-bold text-brand-gold-light"
        >
          <QrCodeIcon weight="fill" size={19} /> Tạo mã QR chuyển khoản
        </button>
        <div className="pb-3.5 text-center text-xs text-sidebar-text-dim-2">
          Mã QR tự điền sẵn số tiền và nội dung theo gói bạn đã chọn.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-[18px] border border-cream p-[22px]">
      <div className="shrink-0 rounded-[14px] border border-[#f0efec] bg-white p-2.5">
        {/* External VietQR endpoint renders the code server-side from amount + note. */}
        <Image
          src={qrSrc}
          alt="Mã QR chuyển khoản"
          width={188}
          height={188}
          className="block h-[188px] w-[188px] object-contain"
        />
      </div>
      <div className="min-w-[220px] flex-1">
        <div className="text-[17px] font-bold text-brand-ink">Quét mã để chuyển khoản</div>
        <div className="mt-1.5 text-[13px] leading-[1.6] text-stone-dark">
          Mở app ngân hàng, chọn quét QR. Số tiền và nội dung đã được điền sẵn.
        </div>
        <div className="mt-3.5 flex flex-col gap-2">
          <div className="flex justify-between gap-3">
            <div className="text-[13px] text-stone">Số tiền</div>
            <div className="text-sm font-bold text-brand-ink">{amount}</div>
          </div>
          <div className="flex justify-between gap-3">
            <div className="text-[13px] text-stone">Nhận được</div>
            <div className="text-sm font-bold text-brand-gold-dark">{tokens} token</div>
          </div>
          <div className="flex justify-between gap-3">
            <div className="text-[13px] text-stone">Nội dung</div>
            <div className="text-right text-[13px] font-semibold text-ink">{note}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onHide}
          className="mt-3.5 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-stone"
        >
          <XIcon size={14} /> Ẩn mã QR
        </button>
      </div>
    </div>
  );
}
