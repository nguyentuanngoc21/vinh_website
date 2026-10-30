"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";

export function DesignShareModal({ id, title, url, onClose, onShared }: {
  id: string;
  title: string;
  url: string;
  onClose: () => void;
  onShared: () => void;
}) {
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function generate() {
      try {
        const QRCode = await import("qrcode");
        if (cancelled) return;
        // Keep preview dimensions independent from the high-resolution download.
        const image = await QRCode.toDataURL(url, {
          width: 1024,
          margin: 4,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#ffffff" },
        });
        if (!cancelled) setQrImage(image);
      } catch {
        if (!cancelled) setQrError(true);
      }
    }
    void generate();
    return () => { cancelled = true; };
  }, [url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Đã sao chép liên kết.");
      onShared();
    } catch {
      setMessage("Không thể tự sao chép. Bạn có thể chọn và sao chép liên kết bên dưới.");
    }
  }

  function downloadQr() {
    if (!qrImage) return;
    try {
      const link = document.createElement("a");
      link.href = qrImage;
      link.download = `vinh-thiet-ke-${id}-qr.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setMessage("Đã yêu cầu tải mã QR PNG.");
      onShared();
    } catch {
      setMessage("Không thể tải mã QR. Vui lòng thử lại.");
    }
  }

  async function shareWithDevice() {
    setBusy(true);
    try {
      await navigator.share({ title, url });
      setMessage("Đã chia sẻ liên kết.");
      onShared();
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setMessage("Không thể chia sẻ qua thiết bị. Bạn có thể sao chép liên kết hoặc tải mã QR.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} panelClassName="flex max-w-md max-h-[calc(100dvh-3rem)] flex-col overflow-hidden p-0">
      <div className="flex shrink-0 items-center justify-between gap-4 bg-brand-navy px-5 py-4 text-white">
        <h2 className="text-lg font-bold">Chia sẻ thiết kế</h2>
        <button type="button" onClick={onClose} aria-label="Đóng hộp chia sẻ" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white">✕</button>
      </div>
      <div className="min-h-0 overflow-y-auto overflow-x-hidden px-5 py-4">
        <p className="break-words text-center text-sm font-semibold text-brand-ink">{title}</p>
        <p className="mt-2 text-center text-sm text-stone-dark">Quét mã QR để xem thiết kế trên Vịnh. Mã không hết hạn.</p>
        <div className="my-4 flex min-w-0 justify-center rounded-xl bg-white p-2">
          {qrImage ? (
            // PNG is generated locally; keep its white quiet zone and full square visible.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImage} width={1024} height={1024} alt={`Mã QR dẫn tới ${title}`} className="block aspect-square h-auto w-full max-w-[min(256px,38dvh)] object-contain" />
          ) : (
            <p role="status" className="py-12 text-center text-sm text-stone">{qrError ? "Không thể tạo mã QR. Vui lòng đóng và thử lại." : "Đang tạo mã QR…"}</p>
          )}
        </div>
        <label className="block text-sm font-semibold text-brand-ink">
          Liên kết tác phẩm
          <input readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="mt-2 block w-full min-w-0 rounded-lg border border-line bg-neutral-bg p-3 text-sm font-normal" />
        </label>
        {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
          <button type="button" onClick={shareWithDevice} disabled={busy} className="mt-3 w-full rounded-full border border-line px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50">Chia sẻ qua thiết bị</button>
        )}
        {message && <p role="status" className="mt-3 text-sm text-stone-dark">{message}</p>}
      </div>
      <div className="grid shrink-0 grid-cols-2 border-t border-line bg-surface-muted">
        <button type="button" onClick={downloadQr} disabled={!qrImage} className="min-w-0 bg-brand-gold px-3 py-4 text-sm font-semibold text-brand-navy disabled:opacity-50">Tải mã QR (PNG)</button>
        <button type="button" onClick={copyLink} className="min-w-0 border-l border-line px-3 py-4 text-sm font-semibold text-brand-ink">Sao chép link</button>
      </div>
    </Modal>
  );
}
