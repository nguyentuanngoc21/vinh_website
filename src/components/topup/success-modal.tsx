import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Modal } from "@/components/ui";

type SuccessModalProps = {
  open: boolean;
  message: string;
  onClose: () => void;
};

/** Confirmation modal shown after "Tôi đã chuyển khoản" is pressed. */
export function SuccessModal({ open, message, onClose }: SuccessModalProps) {
  return (
    <Modal open={open} onClose={onClose} layer="nested" panelClassName="max-w-[400px] p-8 text-center">
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
    </Modal>
  );
}
