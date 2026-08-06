import Link from "next/link";

export function AuthorCta() {
  return (
    <section className="px-11 pb-11">
      <div className="flex flex-col items-start justify-between gap-5 rounded-[20px] bg-[#F7EFD8] px-11 py-9 sm:flex-row sm:items-center">
        <div>
          <div className="text-2xl font-bold text-brand-ink">
            Bạn là tác giả?
          </div>
          <div className="mt-1.5 text-[15px] text-[#6b5f3a]">
            Đăng tác phẩm, theo dõi lượt đọc và nhận bảo hộ bản quyền tự động
            cho mỗi chương.
          </div>
        </div>
        <Link
          href="/author"
          className="shrink-0 whitespace-nowrap rounded-full bg-brand-gold px-8 py-3.5 text-[15px] font-semibold text-brand-ink no-underline"
        >
          Bắt đầu viết
        </Link>
      </div>
    </section>
  );
}
