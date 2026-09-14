"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Modal } from "./modal";
import { Button } from "./button";
import { Alert } from "./alert";

// Trần dài nhất của ảnh SAU khi crop — không phải giới hạn chất lượng, chỉ
// chặn trường hợp cực đoan (ảnh gốc rất lớn + zoom out) tạo ra file vài chục
// megapixel không cần thiết. 2400px vẫn hiển thị sắc nét ở mọi kích thước
// avatar/cover trong UI hiện tại (avatar 82px, cover ~1280px ở lg).
const MAX_OUTPUT_DIMENSION = 2400;
const OUTPUT_QUALITY = 0.92;

type ImageCropModalProps = {
  open: boolean;
  /** object URL của ảnh gốc vừa chọn — modal không tự quản lý lifecycle của
   * URL này, cha (nơi gọi URL.createObjectURL) chịu trách nhiệm revoke sau
   * khi đóng modal. */
  imageSrc: string | null;
  /** Tỉ lệ khung crop, width/height — 1 cho avatar vuông, >1 cho ảnh bìa
   * dạng banner ngang. */
  aspect: number;
  /** "round" cho avatar (khung tròn kiểu Facebook), "rect" cho ảnh bìa. */
  cropShape: "round" | "rect";
  title: string;
  /** Tên file kết quả (không đuôi) — luôn xuất ra .jpg, xem OUTPUT_QUALITY. */
  outputFileName: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

/**
 * Crop ảnh kiểu Facebook — kéo để dịch chuyển, thanh trượt để zoom, khung
 * crop cố định tỉ lệ. Dùng react-easy-crop (xử lý sẵn kéo/pinch-zoom/wheel
 * trên cả chuột lẫn cảm ứng) — tự viết lại phần này rủi ro bỏ sót case cảm
 * ứng/high-DPI, trong khi đây là bài toán đã chuẩn hoá tốt.
 *
 * Không tự mở/đóng theo file input — cha (profile-header.tsx) quản lý toàn
 * bộ state chọn file -> crop -> upload, modal này chỉ thuần crop.
 */
export function ImageCropModal({
  open,
  imageSrc,
  aspect,
  cropShape,
  title,
  outputFileName,
  onCancel,
  onConfirm,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  // Không tự reset crop/zoom ở đây bằng effect (setState-trong-effect gây
  // cascading render, và không phải cách React khuyến nghị để "reset state
  // khi prop đổi"). Thay vào đó, nơi gọi (profile-header.tsx) truyền
  // `key={imageSrc}` cho <ImageCropModal> — mỗi ảnh mới ứng với 1 key mới,
  // React tự unmount/remount toàn bộ component, crop/zoom/... về lại giá
  // trị khởi tạo mà không cần effect nào.

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setProcessing(true);
    setCropError(null);
    try {
      const file = await cropToFile(imageSrc, croppedAreaPixels, outputFileName);
      onConfirm(file);
    } catch (err) {
      console.error("[ImageCropModal] crop failed:", err);
      setCropError("Không xử lý được ảnh, thử lại.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal open={open && !!imageSrc} onClose={onCancel} closeOnBackdrop={false} panelClassName="max-w-[480px] p-6">
      <h2 className="font-[family-name:var(--font-lora)] text-lg font-bold text-brand-ink">{title}</h2>

      <div className="relative mt-4 h-[320px] w-full overflow-hidden rounded-[14px] bg-brand-ink-dark/90">
        {imageSrc && (
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={cropShape === "rect"}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs font-medium text-stone-dark">Thu phóng</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-stone accent-brand-gold-dark"
          aria-label="Thu phóng ảnh"
        />
      </div>

      {cropError && (
        <div className="mt-3">
          <Alert tone="error">{cropError}</Alert>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2.5">
        <Button variant="ghost" fullWidth={false} className="px-6" onClick={onCancel} disabled={processing}>
          Huỷ
        </Button>
        <Button
          variant="primary"
          fullWidth={false}
          className="px-6"
          onClick={handleConfirm}
          disabled={processing || !croppedAreaPixels}
        >
          {processing ? "Đang xử lý…" : "Xong"}
        </Button>
      </div>
    </Modal>
  );
}

/** Vẽ đúng vùng đã crop (toạ độ pixel gốc, do react-easy-crop tính sẵn) ra
 * canvas rồi xuất JPEG — giữ nguyên độ phân giải gốc trong vùng crop, chỉ hạ
 * xuống nếu vượt MAX_OUTPUT_DIMENSION. */
async function cropToFile(imageSrc: string, area: Area, fileName: string): Promise<File> {
  const image = await loadImage(imageSrc);

  const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(area.width, area.height));
  const outputWidth = Math.round(area.width * scale);
  const outputHeight = Math.round(area.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không tạo được canvas.");

  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", OUTPUT_QUALITY));
  if (!blob) throw new Error("Không xuất được ảnh đã crop.");
  return new File([blob], `${fileName}.jpg`, { type: "image/jpeg" });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
