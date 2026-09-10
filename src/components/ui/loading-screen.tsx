import { VinhMark } from "./vinh-mark";

/**
 * Màn hình loading toàn trang — phủ 1 lớp đen mờ (20%), logo Vịnh đứng
 * yên giữa 1 vòng tròn xoay quanh nó (dùng đúng hình tròn bao quanh logo
 * làm hiệu ứng xoay, không phải logo tự xoay — logo xoay sẽ khó nhìn/
 * mất hình dạng thương hiệu). Dùng ở src/app/loading.tsx (Next.js tự
 * hiện khi chuyển trang/route đang tải dữ liệu server) — cũng export ra
 * ui/index.ts để dùng lại ở nơi khác nếu cần (vd 1 hành động async dài
 * ngay trong 1 trang, không phải chuyển route).
 *
 * z-[300] — cao hơn MỌI z-index khác trong repo (modal cao nhất hiện có
 * là z-[201]) vì đây là lớp phủ TOÀN TRANG, phải luôn nổi lên trên hết.
 */
export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-4 bg-black/20">
      <div className="relative flex h-[76px] w-[76px] items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-brand-gold/25 border-t-brand-gold" />
        <VinhMark size={42} tone="ink" />
      </div>
      <div className="text-sm font-semibold tracking-[.3px] text-brand-ink">Đang tải...</div>
    </div>
  );
}
