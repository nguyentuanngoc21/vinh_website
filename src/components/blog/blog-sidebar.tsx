import Link from "next/link";
import { POPULAR_POSTS, TOPICS } from "@/lib/blog";

export function BlogSidebar() {
  return (
    <div className="flex flex-col gap-[26px]">
      <div className="rounded-[18px] bg-[#F7EFD8] p-6">
        <div className="text-[17px] font-bold text-brand-ink">Bản tin Vịnh</div>
        <div className="mt-[7px] text-[13.5px] leading-[1.55] text-[#6b5f3a]">
          Mỗi thứ Năm: một tác phẩm mới, một bài viết về nghề, một mẹo bảo vệ
          bản quyền.
        </div>
        <div className="mt-4 flex gap-2">
          <div className="flex-1 rounded-full bg-white px-4 py-[11px] text-[13.5px] text-[#a49a86]">
            Email của bạn
          </div>
          <div className="cursor-pointer rounded-full bg-brand-ink px-5 py-[11px] text-[13.5px] font-semibold text-white">
            Đăng ký
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3.5 text-[17px] font-bold text-brand-ink">
          Đọc nhiều nhất
        </div>
        <div className="flex flex-col gap-3.5">
          {POPULAR_POSTS.map((p, i) => (
            <Link key={p.title} href="/read" className="flex items-start gap-3.5 no-underline">
              <div
                style={{ color: i < 3 ? "var(--color-brand-gold)" : "#d6d0c6" }}
                className="w-[26px] shrink-0 text-xl font-extrabold leading-[1.1]"
              >
                {i + 1}
              </div>
              <div>
                <div className="text-[14.5px] font-semibold leading-[1.4] text-ink">
                  {p.title}
                </div>
                <div className="mt-[3px] text-[12.5px] text-stone">
                  {p.meta}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-[18px] border border-cream p-[22px]">
        <div className="mb-3 text-[17px] font-bold text-brand-ink">Chủ đề</div>
        <div className="flex flex-wrap gap-2 text-sm font-medium">
          {TOPICS.map((topic) => (
            <span key={topic} className="rounded-full bg-neutral-bg px-[13px] py-[7px]">
              {topic}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
