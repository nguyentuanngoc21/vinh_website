"use client";

import { useState } from "react";
import Link from "next/link";
import { ClockIcon, ChatCircleIcon, ArrowDownIcon } from "@phosphor-icons/react/dist/ssr";
import { CATEGORIES, ALL_POSTS } from "@/lib/blog";
import { BlogSidebar } from "@/components/blog/blog-sidebar";

export function BlogPosts() {
  const [cat, setCat] = useState("Tất cả");
  const [limit, setLimit] = useState(5);

  const filtered = ALL_POSTS.filter((p) => cat === "Tất cả" || p.c === cat);
  const posts = filtered.slice(0, limit);
  const exhausted = limit >= filtered.length;

  return (
    <>
      <div className="flex flex-wrap gap-2.5 px-11 pb-1.5 pt-[34px]">
        {CATEGORIES.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setCat(label);
              setLimit(5);
            }}
            className={`cursor-pointer rounded-full px-[18px] py-2.5 text-sm font-medium transition-colors ${
              label === cat ? "bg-brand-ink text-white" : "bg-neutral-bg text-[#3a3a3a]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-12 px-11 pb-2.5 pt-5.5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col">
          {posts.map((p) => (
            <Link
              key={p.title}
              href="/read"
              className="grid grid-cols-1 gap-5 border-b border-[#f1efec] p-5 no-underline transition-colors hover:bg-cream-card sm:grid-cols-[180px_1fr]"
            >
              <div
                style={{ background: p.gradient }}
                className="h-[124px] w-full shrink-0 rounded-xl sm:w-[180px]"
              />
              <div>
                <div className="flex items-center gap-2.5 text-[11.5px] font-semibold tracking-[.6px] text-brand-gold-dark">
                  {p.cat}
                  <span className="font-normal text-[#c9c1b6]">·</span>
                  <span className="font-normal tracking-normal text-stone">
                    {p.date}
                  </span>
                </div>
                <div className="mt-[7px] font-[family-name:var(--font-lora)] text-xl font-bold leading-[1.3] text-brand-ink">
                  {p.title}
                </div>
                <div className="mt-2 max-w-[560px] text-sm leading-[1.6] text-stone-dark">
                  {p.excerpt}
                </div>
                <div className="mt-3 flex items-center gap-4 text-[12.5px] font-medium text-stone-light">
                  <span>{p.author}</span>
                  <span className="flex items-center gap-1">
                    <ClockIcon /> {p.read}
                  </span>
                  <span className="flex items-center gap-1">
                    <ChatCircleIcon /> {p.comments}
                  </span>
                </div>
              </div>
            </Link>
          ))}

          <div className="flex justify-center pb-1.5 pt-[26px]">
            <button
              type="button"
              onClick={() => setLimit((l) => l + 3)}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-[#e2ded7] px-7 py-3 text-sm font-semibold text-brand-ink"
            >
              {exhausted ? "Đã hết bài trong chủ đề này" : "Xem thêm bài viết"}
              <ArrowDownIcon />
            </button>
          </div>
        </div>

        <BlogSidebar />
      </div>
    </>
  );
}
