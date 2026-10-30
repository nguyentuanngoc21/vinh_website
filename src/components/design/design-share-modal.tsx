"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";

export function DesignShareModal({ id, title, url, onClose, onShared }: {
  id: string;
  title: string;
  url: string;
  onClose: () => void;
  onShared: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [qrError, setQrError] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function generate() {
      try {
        const QRCode = await import("qrcode");
        if (cancelled || !canvasRef.current) return;
        await QRCode.toCanvas(canvasRef.current, url, {
          width: 1024,
          margin: 4,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#ffffff" },
        });
        if (!cancelled) setReady(true);
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
    if (!ready || !canvasRef.current) return;
    try {
      const link = document.createElement("a");
      link.href = canvasRef.current.toDataURL("image/png");
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
    <Modal open onClose={onClose} panelClassName="max-w-md max-h-[90dvh] overflow-y-auto p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-bold text-brand-ink">Chia sẻ thiết kế</h2>
        <button type="button" onClick={onClose} aria-label="Đóng hộp chia sẻ" className="rounded-full px-3 py-1 text-stone">✕</button>
      </div>
      <p className="mt-2 break-words text-sm text-stone-dark">{title}</p>
      <div className="my-5 flex justify-center">
        <canvas ref={canvasRef} role="img" aria-label={`Mã QR dẫn tới ${title}`} className={ready ? "h-56 w-56" : "hidden"} />
        {!ready && <p role="status" className="py-12 text-sm text-stone">{qrError ? "Không thể tạo mã QR. Vui lòng đóng và thử lại." : "Đang tạo mã QR…"}</p>}
      </div>
      <p className="mb-4 text-center text-sm text-stone-dark">Mã QR không hết hạn, dẫn tới trang thiết kế này trên Vịnh.</p>
      <label className="block text-sm font-semibold text-brand-ink">
        Liên kết tác phẩm
        <input readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full rounded-lg border border-line bg-neutral-bg p-3 text-sm font-normal" />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={copyLink} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-brand-ink">Sao chép link</button>
        <button type="button" onClick={downloadQr} disabled={!ready} className="rounded-full bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy disabled:opacity-50">Tải mã QR (PNG)</button>
        {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
          <button type="button" onClick={shareWithDevice} disabled={busy} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50">Chia sẻ qua thiết bị</button>
        )}
      </div>
      <p role="status" className="mt-3 text-sm text-stone-dark">{message}</p>
    </Modal>
  );
}
