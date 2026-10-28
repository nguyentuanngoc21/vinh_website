"use client";

import { type ImgHTMLAttributes, type SyntheticEvent } from "react";
import { cn } from "@/lib/cn";
import { publicImageProps } from "@/lib/media/public-image";

/**
 * Ảnh tác phẩm (thiết kế, ảnh chèn trong chương, bìa do họa sĩ vẽ) — chặn
 * các cách lấy ảnh THÔNG THƯỜNG:
 *   - chuột phải → "Lưu ảnh/Sao chép ảnh" (onContextMenu)
 *   - kéo ảnh ra desktop/tab khác (draggable=false + onDragStart)
 *   - nhấn giữ trên iOS/Android → menu lưu ảnh (-webkit-touch-callout +
 *     ảnh pointer-events-none, lớp phủ trong suốt nhận thao tác thay)
 *   - bôi đen rồi Ctrl/Cmd+C (select-none + onCopy)
 *
 * KHÔNG phải DRM: ảnh vẫn tải về trình duyệt nên devtools/network tab hay
 * chụp màn hình vẫn lấy được (xem ghi chú .no-copy-image ở globals.css).
 *
 * `wrapperClassName` áp cho khung bọc (đặt kích thước/vị trí ở đây khi ảnh
 * cần lấp đầy 1 ô: vd `h-full w-full`); `className`/`style` áp cho <img>.
 * Khung là <span className="block"> để đặt được cả bên trong <a>/<button>.
 *
 * "use client" BẮT BUỘC: component gắn onContextMenu/onDragStart/onCopy, mà
 * BookCover và /tim-kiem là Server Component — thiếu directive thì server
 * không serialize được hàm xử lý sự kiện và trang lỗi ngay khi có ảnh thật
 * (sự cố production 30/09/2026).
 */
type ProtectedImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
  displayWidth?: number;
};

const block = (e: SyntheticEvent) => e.preventDefault();

export function ProtectedImage({ wrapperClassName, className, alt = "", displayWidth = 640, src, loading = "lazy", decoding = "async", ...imgProps }: ProtectedImageProps) {
  return (
    <span
      className={cn("no-copy-image relative block", wrapperClassName)}
      onContextMenu={block}
      onDragStart={block}
      onCopy={block}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...imgProps}
        {...(typeof src === "string" && !imgProps.srcSet ? publicImageProps(src, displayWidth) : { src })}
        loading={loading}
        decoding={decoding}
        alt={alt}
        draggable={false}
        className={cn("no-copy-image pointer-events-none", className)}
      />
      <span aria-hidden className="absolute inset-0" />
    </span>
  );
}
