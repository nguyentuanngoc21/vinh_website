import Link from "next/link";
import { SIDE_POSTS } from "@/lib/blog";

export function FeaturedGrid() {
  return (
    <section className="grid grid-cols-1 gap-[26px] px-11 pb-1.5 pt-6 lg:grid-cols-[1.35fr_1fr]">
      <Link
        href="/read"
        className="flex min-h-[330px] flex-col justify-end rounded-[20px] bg-brand-ink-dark p-9 text-white no-underline transition-[transform,box-shadow] duration-[250ms] hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(0,0,0,.14)]"
      >
        <div className="inline-flex w-fit items-center gap-[7px] rounded-full bg-brand-gold/20 px-[13px] py-1.5 text-[11.5px] font-semibold text-brand-gold-light">
          BÀI NỔI BẬT · BẢN QUYỀN
        </div>
        <div className="mt-4 max-w-[520px] font-[family-name:var(--font-lora)] text-[30px] font-bold leading-[1.25]">
          Watermark động: cách Vịnh bảo vệ từng trang đọc mà không làm hỏng
          trải nghiệm
        </div>
        <div className="mt-3 max-w-[520px] text-[14.5px] leading-[1.6] text-sidebar-text-dim-2">
          Mỗi phiên đọc mang một dấu chìm riêng gắn với tài khoản. Nếu ảnh
          chụp bị rò rỉ, chúng tôi truy được nguồn trong vài giây.
        </div>
        <div className="mt-5 flex items-center gap-2.5 text-[13px] font-medium text-sidebar-text">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gold text-xs font-bold text-brand-ink">
            V
          </div>
          Đội ngũ Vịnh · 04/08/2026 · 7 phút đọc
        </div>
      </Link>

      <div className="flex flex-col gap-4">
        {SIDE_POSTS.map((s) => (
          <Link
            key={s.title}
            href="/read"
            className="flex gap-4 rounded-2xl border border-cream bg-white p-4 no-underline transition-[transform,box-shadow] duration-[250ms] hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(0,0,0,.14)]"
          >
            <div
              style={{ background: s.gradient }}
              className="h-[92px] w-[92px] shrink-0 rounded-xl"
            />
            <div>
              <div className="text-[11.5px] font-semibold tracking-[.6px] text-brand-gold-dark">
                {s.cat}
              </div>
              <div className="mt-[5px] text-base font-semibold leading-[1.35] text-ink">
                {s.title}
              </div>
              <div className="mt-1.5 text-[12.5px] text-stone">
                {s.meta}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
