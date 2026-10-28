import type { ImgHTMLAttributes } from "react";
import { publicImageProps } from "@/lib/media/public-image";

export function DisplayImage({ src, displayWidth = 640, loading = "lazy", decoding = "async", alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement> & { displayWidth?: number }) {
  // Preserve the caller's dimensions and CSS; only replace public Storage sources.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} {...(typeof src === "string" && !props.srcSet ? publicImageProps(src, displayWidth) : { src })} alt={alt} loading={loading} decoding={decoding} />;
}
