import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";

type SuccessModalProps = {
  open: boolean;
  message: string;
  onClose: () => void;
};

/** Confirmation modal shown after "Tôi đã chuyển khoản" is pressed. */
export function SuccessModal({ open, message, onClose }: SuccessModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-ink-dark/55 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-[20px] bg-white p-8 text-center shadow-[0_24px_60px_rgba(0,0,0,.28)]"
      >
        <div className="mx-auto flex h-[62px] w-[62px] items-center justify-center rounded-full bg-[#DBF3E8] text-[#2C7453]">
          <CheckCircleIcon weight="fill" size={34} />
        </div>
        <div className="mt-4 font-[family-name:var(--font-lora)] text-xl font-bold text-brand-ink">
          Nạp token thành công
        </div>
        <div className="mt-2 text-[13.5px] leading-[1.65] text-stone-dark">{message}</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 inline-block cursor-pointer rounded-full bg-brand-gold px-[26px] py-3 text-sm font-semibold text-brand-ink"
        >
          Xong
        </button>
      </div>
    </div>
  );
}
