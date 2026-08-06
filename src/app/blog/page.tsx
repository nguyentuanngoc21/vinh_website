import type { Metadata } from "next";
import { Lora } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { FeaturedGrid } from "@/components/blog/featured-grid";
import { BlogPosts } from "@/components/blog/blog-posts";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Blog — Vịnh",
};

export default function BlogPage() {
  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader searchPlaceholder="Tìm bài viết…" ctaLabel="Viết bài" />
        <main>
          <div className="px-11 pb-1.5 pt-9">
            <div className="text-xs font-semibold tracking-[1.4px] text-brand-gold-dark">
              BLOG VỊNH
            </div>
            <h1 className="mt-2 max-w-[640px] font-[family-name:var(--font-lora)] text-[34px] font-bold leading-[1.2] text-brand-ink">
              Chuyện nghề viết, bản quyền số và những người kể chuyện Việt
            </h1>
          </div>

          <FeaturedGrid />
          <BlogPosts />

          <section className="px-11 pb-[46px] pt-[30px]">
            <div className="flex items-center justify-between rounded-[20px] bg-brand-ink-dark px-10 py-8 text-white">
              <div>
                <div className="text-[22px] font-bold">
                  Bạn có chuyện muốn kể?
                </div>
                <div className="mt-[5px] text-[14.5px] text-sidebar-text-dim-2">
                  Gửi bài cho blog Vịnh — biên tập viên phản hồi trong 3 ngày
                  làm việc.
                </div>
              </div>
              <Link
                href="/author"
                className="shrink-0 whitespace-nowrap rounded-full bg-brand-gold px-[30px] py-3.5 text-[15px] font-semibold text-brand-ink no-underline"
              >
                Gửi bài viết
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
