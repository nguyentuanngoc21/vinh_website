import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 text-center">
      <div className="text-lg font-bold text-brand-ink">Không tìm thấy trang</div>
      <div className="max-w-[420px] text-sm text-stone-dark">
        Trang bạn đang tìm không tồn tại hoặc đã bị gỡ.
      </div>
      <Link
        href="/"
        className="mt-2 flex items-center rounded-[10px] bg-brand-gold px-6 py-[14px] text-[15px] font-bold text-brand-ink no-underline"
      >
        Về trang chủ
      </Link>
    </div>
  );
}
