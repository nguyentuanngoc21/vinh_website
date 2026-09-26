/**
 * Key visual của cuộc thi — ảnh do BTC tải lên, hoặc nền gradient navy/gold
 * của thương hiệu khi chưa có ảnh (thiết kế: "chỉ key visual thay đổi").
 */
export function ContestKeyVisual({
  url,
  title,
  className = "",
  children,
}: {
  url: string | null;
  title: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden bg-brand-ink-dark ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ URL do admin nhập (domain không cố định)
        <img src={url} alt={title} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 70% 30%, var(--color-brand-ink) 0%, var(--color-brand-ink-dark) 70%), linear-gradient(135deg, transparent 60%, var(--color-brand-gold) 140%)",
          }}
        />
      )}
      {children}
    </div>
  );
}
