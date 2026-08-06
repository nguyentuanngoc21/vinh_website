"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HeartIcon, ShareNetworkIcon, ImageSquareIcon } from "@phosphor-icons/react/dist/ssr";
import {
  CATEGORIES,
  SORTS,
  SORT_DESCRIPTIONS,
  DESIGN_PINS,
  formatCount,
  type Category,
  type SortKey,
} from "@/lib/design-gallery";

export function DesignGallery() {
  const [cat, setCat] = useState<Category>("Tất cả");
  const [sort, setSort] = useState<SortKey>("likes");
  const [openId, setOpenId] = useState<number | null>(null);
  const [liked, setLiked] = useState<Record<number, boolean>>({});

  const list = useMemo(() => {
    const filtered = DESIGN_PINS.filter((p) => cat === "Tất cả" || p.cat === cat);
    return filtered
      .slice()
      .sort((a, b) =>
        sort === "new" ? b.id - a.id : sort === "shares" ? b.shares - a.shares : b.likes - a.likes
      );
  }, [cat, sort]);

  const open = openId != null ? (DESIGN_PINS.find((p) => p.id === openId) ?? null) : null;
  const openRank = open ? list.findIndex((p) => p.id === open.id) + 1 : 0;
  const openLiked = open ? !!liked[open.id] : false;

  const toggleLike = (id: number) => setLiked((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-6 px-11 pt-9">
        <div>
          <div className="text-xs font-semibold tracking-[1.4px] text-brand-gold-dark">
            THƯ VIỆN THIẾT KẾ
          </div>
          <h1 className="mt-2 max-w-[620px] font-[family-name:var(--font-lora)] text-[34px] font-bold leading-[1.2] text-brand-ink">
            Ảnh bìa và minh họa được cộng đồng yêu thích nhất
          </h1>
          <p className="mt-2.5 max-w-[560px] text-[14.5px] leading-[1.6] text-stone-dark">
            Thứ hạng cập nhật mỗi giờ theo lượt thích và lượt chia sẻ. Mọi tác
            phẩm đều gắn dấu chìm của họa sĩ.
          </p>
        </div>
        <div className="flex shrink-0 gap-2 rounded-full bg-neutral-bg p-[5px]">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              style={{
                background: s.key === sort ? "#fff" : "transparent",
                color: s.key === sort ? "var(--color-brand-ink)" : "var(--color-stone)",
                boxShadow: s.key === sort ? "0 1px 4px rgba(0,0,0,.12)" : "none",
              }}
              className="cursor-pointer whitespace-nowrap rounded-full px-[18px] py-2.5 text-[13.5px] font-semibold transition-all"
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2.5 px-11 pb-1 pt-6">
        {CATEGORIES.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setCat(label)}
            className={`cursor-pointer rounded-full px-[18px] py-2.5 text-sm font-medium transition-colors ${
              label === cat ? "bg-brand-ink text-white" : "bg-neutral-bg text-[#3a3a3a]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2.5 px-11 pt-2 text-[13px] font-medium text-stone">
        <ImageSquareIcon color="var(--color-brand-gold-dark)" />
        {list.length} tác phẩm · xếp theo {SORT_DESCRIPTIONS[sort]}
      </div>

      <div className="px-11 pb-2 pt-[18px]">
        <div style={{ columnWidth: 270, columnGap: 18 }}>
          {list.map((p, i) => {
            const showRank = i < 3 && sort !== "new";
            return (
              <div
                key={p.id}
                onClick={() => setOpenId(p.id)}
                className="group relative mb-[18px] block cursor-pointer break-inside-avoid overflow-hidden rounded-2xl"
              >
                <div style={{ height: p.height, background: p.gradient }} />

                {showRank && (
                  <div className="absolute left-3 top-3 rounded-full bg-brand-gold px-2.5 py-1 text-[11px] font-bold tracking-[.5px] text-brand-ink">
                    TOP {i + 1}
                  </div>
                )}

                <div className="absolute right-3 top-3 flex -translate-y-1.5 gap-2 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                  <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white/94 text-brand-ink transition-colors hover:bg-brand-gold">
                    <HeartIcon size={16} />
                  </span>
                  <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white/94 text-brand-ink transition-colors hover:bg-brand-gold">
                    <ShareNetworkIcon size={16} />
                  </span>
                </div>

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-ink-dark/0 from-[38%] to-brand-ink-dark/86 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

                <div className="absolute inset-x-0 bottom-0 p-4 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <div className="truncate text-[15px] font-semibold leading-[1.35]">
                    {p.title}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[12.5px] font-medium text-[#dbe4e8]">
                    <span className="flex min-w-0 items-center gap-[7px]">
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-white/22 text-[10px] font-bold">
                        {p.artist[0]}
                      </span>
                      <span className="truncate">{p.artist}</span>
                    </span>
                    <span className="flex shrink-0 gap-3">
                      <span className="flex items-center gap-1">
                        <HeartIcon weight="fill" color="var(--color-brand-gold-light)" />
                        {formatCount(p.likes + (liked[p.id] ? 1 : 0))}
                      </span>
                      <span className="flex items-center gap-1">
                        <ShareNetworkIcon />
                        {formatCount(p.shares)}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {open && (
        <div
          onClick={() => setOpenId(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-ink-dark/62 p-10"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="grid w-full max-w-[960px] overflow-hidden rounded-[22px] bg-white shadow-[0_30px_80px_rgba(0,0,0,.35)] sm:grid-cols-[1.15fr_minmax(0,1fr)]"
          >
            <div style={{ background: open.gradient }} className="min-h-[220px] sm:min-h-[460px]" />
            <div className="flex flex-col p-[34px] pb-[30px]">
              <div className="text-[11.5px] font-semibold tracking-[1.2px] text-brand-gold-dark">
                {open.cat.toUpperCase()}
              </div>
              <div className="mt-2.5 font-[family-name:var(--font-lora)] text-[26px] font-bold leading-[1.3] text-brand-ink">
                {open.title}
              </div>
              <div className="mt-[18px] flex items-center gap-[11px]">
                <div
                  style={{ background: open.gradient }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                >
                  {open.artist[0]}
                </div>
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">
                    {open.artist}
                  </div>
                  <div className="text-[12.5px] text-stone">
                    Họa sĩ · {open.works} tác phẩm
                  </div>
                </div>
                <Link
                  href={`/ket-noi?p=${open.artistId}`}
                  className="ml-auto whitespace-nowrap rounded-full border border-[#e2ded7] px-[18px] py-2.5 text-[13px] font-semibold text-brand-ink no-underline"
                >
                  Xem hồ sơ
                </Link>
              </div>
              <div className="mt-[22px] flex gap-[26px] border-y border-[#f1efec] py-[18px]">
                <div>
                  <div className="text-[22px] font-extrabold text-brand-ink">
                    {formatCount(open.likes + (openLiked ? 1 : 0))}
                  </div>
                  <div className="text-[12.5px] text-stone">Lượt thích</div>
                </div>
                <div>
                  <div className="text-[22px] font-extrabold text-brand-ink">
                    {formatCount(open.shares)}
                  </div>
                  <div className="text-[12.5px] text-stone">Chia sẻ</div>
                </div>
                <div>
                  <div className="text-[22px] font-extrabold text-brand-ink">#{openRank}</div>
                  <div className="text-[12.5px] text-stone">Hạng tuần</div>
                </div>
              </div>
              <p className="mt-[18px] text-sm leading-[1.65] text-stone-dark">{open.desc}</p>
              <div className="mt-auto flex items-center gap-2.5 pt-6">
                <button
                  type="button"
                  onClick={() => toggleLike(open.id)}
                  style={{
                    background: openLiked ? "var(--color-brand-ink)" : "var(--color-brand-gold)",
                    color: openLiked ? "#fff" : "var(--color-brand-ink)",
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-colors"
                >
                  <HeartIcon weight="fill" />
                  {openLiked ? "Đã thích" : "Thích"}
                </button>
                <span className="flex cursor-default items-center gap-2 rounded-full border border-[#e2ded7] px-5 py-3 text-sm font-semibold text-brand-ink">
                  <ShareNetworkIcon />
                  Chia sẻ
                </span>
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  className="ml-auto cursor-pointer rounded-full border border-[#e2ded7] px-[18px] py-3 text-sm font-semibold text-stone"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
