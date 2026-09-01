"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HeartIcon, ShareNetworkIcon, ImageSquareIcon } from "@phosphor-icons/react/dist/ssr";
import { shareOrCopy } from "@/lib/share";
import {
  DESIGN_CATEGORIES,
  DESIGN_SORTS,
  DESIGN_SORT_DESCRIPTIONS,
  formatCount,
  type DesignSortKey,
  type GalleryDesignItem,
} from "@/lib/design/get-design-gallery";
import type { DesignItemCategory } from "@/lib/supabase/types";

const AVATAR_COLORS = [
  "var(--color-brand-ink)",
  "var(--color-success)",
  "var(--color-chart-pink)",
  "var(--color-chart-amber)",
  "var(--color-chart-indigo)",
  "var(--color-chart-teal)",
];
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

type CategoryFilter = DesignItemCategory | "Tất cả";
const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "Tất cả", label: "Tất cả" },
  ...DESIGN_CATEGORIES.map((c) => ({ key: c.key as CategoryFilter, label: c.label })),
];

type LikeState = { liked: boolean; count: number };

export function DesignGallery({ items }: { items: GalleryDesignItem[] }) {
  const [cat, setCat] = useState<CategoryFilter>("Tất cả");
  const [sort, setSort] = useState<DesignSortKey>("likes");
  const [openId, setOpenId] = useState<string | null>(null);
  const [likeState, setLikeState] = useState<Record<string, LikeState>>(() =>
    Object.fromEntries(items.map((p) => [p.id, { liked: p.likedByViewer, count: p.likeCount }]))
  );
  const [shareCounts, setShareCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((p) => [p.id, p.shareCount]))
  );
  const [likePending, setLikePending] = useState<Record<string, boolean>>({});

  const likeCountOf = (id: string) => likeState[id]?.count ?? 0;
  const likedByViewerOf = (id: string) => likeState[id]?.liked ?? false;
  const shareCountOf = (id: string) => shareCounts[id] ?? 0;

  const list = useMemo(() => {
    const filtered = items.filter((p) => cat === "Tất cả" || p.category === cat);
    return filtered.slice().sort((a, b) => {
      if (sort === "new") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "shares") return shareCountOf(b.id) - shareCountOf(a.id);
      return likeCountOf(b.id) - likeCountOf(a.id);
    });
    // shareCounts/likeState intentionally tracked so re-sort follows live counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cat, sort, likeState, shareCounts]);

  const open = openId != null ? (items.find((p) => p.id === openId) ?? null) : null;
  const openRank = open ? list.findIndex((p) => p.id === open.id) + 1 : 0;

  const toggleLike = async (id: string) => {
    if (likePending[id]) return;
    setLikePending((prev) => ({ ...prev, [id]: true }));
    // Optimistic flip — reconciled with the server's real count below.
    setLikeState((prev) => {
      const cur = prev[id] ?? { liked: false, count: 0 };
      return { ...prev, [id]: { liked: !cur.liked, count: cur.count + (cur.liked ? -1 : 1) } };
    });
    try {
      const res = await fetch(`/api/design/${id}/like`, { method: "POST" });
      if (res.status === 401) {
        // Chưa đăng nhập — trả optimistic state về như cũ, không hiện lỗi ồn ào.
        setLikeState((prev) => {
          const cur = prev[id] ?? { liked: false, count: 0 };
          return { ...prev, [id]: { liked: !cur.liked, count: cur.count + (cur.liked ? -1 : 1) } };
        });
        return;
      }
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setLikeState((prev) => ({ ...prev, [id]: { liked: !!data.liked, count: data.likeCount ?? 0 } }));
      }
    } finally {
      setLikePending((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleShare = async (item: GalleryDesignItem) => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/thiet-ke?item=${item.id}` : "";
    const result = await shareOrCopy({ title: item.title, text: `${item.title} — ${item.illustratorName}`, url });
    if (result === "failed") return;
    const res = await fetch(`/api/design/${item.id}/share`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok && data) setShareCounts((prev) => ({ ...prev, [item.id]: data.shareCount ?? prev[item.id] }));
  };

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
            Xếp theo lượt thích và lượt chia sẻ thật từ cộng đồng. Mọi tác
            phẩm đều gắn dấu chìm của họa sĩ.
          </p>
        </div>
        <div className="flex shrink-0 gap-2 rounded-full bg-neutral-bg p-[5px]">
          {DESIGN_SORTS.map((s) => (
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
        {CATEGORY_FILTERS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCat(c.key)}
            className={`cursor-pointer rounded-full px-[18px] py-2.5 text-sm font-medium transition-colors ${
              c.key === cat ? "bg-brand-ink text-white" : "bg-neutral-bg text-[#3a3a3a]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2.5 px-11 pt-2 text-[13px] font-medium text-stone">
        <ImageSquareIcon color="var(--color-brand-gold-dark)" />
        {list.length === 0
          ? "Chưa có tác phẩm nào trong mục này"
          : `${list.length} tác phẩm · xếp theo ${DESIGN_SORT_DESCRIPTIONS[sort]}`}
      </div>

      {list.length === 0 ? (
        <div className="mx-11 my-8 rounded-2xl border border-dashed border-[#e2ded7] px-8 py-14 text-center">
          <p className="text-sm text-stone-dark">
            Chưa có ai đăng thiết kế ở mục này. Là người đầu tiên?
          </p>
          <Link
            href="/thiet-ke/new"
            className="mt-4 inline-block rounded-full bg-brand-gold px-6 py-2.5 text-sm font-semibold text-brand-ink no-underline"
          >
            Đăng thiết kế
          </Link>
        </div>
      ) : (
        <div className="px-11 pb-2 pt-[18px]">
          <div style={{ columnWidth: 270, columnGap: 18 }}>
            {list.map((p, i) => {
              const showRank = i < 3 && sort !== "new";
              return (
                <div
                  key={p.id}
                  onClick={() => setOpenId(p.id)}
                  className="group relative mb-[18px] block cursor-pointer break-inside-avoid overflow-hidden rounded-2xl bg-neutral-bg"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt={p.title} className="block w-full" loading="lazy" />

                  {showRank && (
                    <div className="absolute left-3 top-3 rounded-full bg-brand-gold px-2.5 py-1 text-[11px] font-bold tracking-[.5px] text-brand-ink">
                      TOP {i + 1}
                    </div>
                  )}

                  <div className="absolute right-3 top-3 flex -translate-y-1.5 gap-2 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(p.id);
                      }}
                      style={likedByViewerOf(p.id) ? { background: "var(--color-brand-gold)" } : undefined}
                      className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full bg-white/94 text-brand-ink transition-colors hover:bg-brand-gold"
                    >
                      <HeartIcon weight={likedByViewerOf(p.id) ? "fill" : "regular"} size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShare(p);
                      }}
                      className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full bg-white/94 text-brand-ink transition-colors hover:bg-brand-gold"
                    >
                      <ShareNetworkIcon size={16} />
                    </button>
                  </div>

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-ink-dark/0 from-[38%] to-brand-ink-dark/86 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

                  <div className="absolute inset-x-0 bottom-0 p-4 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <div className="truncate text-[15px] font-semibold leading-[1.35]">
                      {p.title}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[12.5px] font-medium text-[#dbe4e8]">
                      <span className="flex min-w-0 items-center gap-[7px]">
                        <span
                          style={{ background: avatarColor(p.illustratorName) }}
                          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        >
                          {p.illustratorName[0]}
                        </span>
                        <span className="truncate">{p.illustratorName}</span>
                      </span>
                      <span className="flex shrink-0 gap-3">
                        <span className="flex items-center gap-1">
                          <HeartIcon weight="fill" color="var(--color-brand-gold-light)" />
                          {formatCount(likeCountOf(p.id))}
                        </span>
                        <span className="flex items-center gap-1">
                          <ShareNetworkIcon />
                          {formatCount(shareCountOf(p.id))}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {open && (
        <div
          onClick={() => setOpenId(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-ink-dark/62 p-10"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="grid w-full max-w-[960px] overflow-hidden rounded-[22px] bg-white shadow-[0_30px_80px_rgba(0,0,0,.35)] sm:grid-cols-[1.15fr_minmax(0,1fr)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={open.imageUrl}
              alt={open.title}
              className="min-h-[220px] w-full object-cover sm:min-h-[460px]"
            />
            <div className="flex flex-col p-[34px] pb-[30px]">
              <div className="text-[11.5px] font-semibold tracking-[1.2px] text-brand-gold-dark">
                {open.categoryLabel.toUpperCase()}
              </div>
              <div className="mt-2.5 font-[family-name:var(--font-lora)] text-[26px] font-bold leading-[1.3] text-brand-ink">
                {open.title}
              </div>
              <div className="mt-[18px] flex items-center gap-[11px]">
                <div
                  style={{ background: avatarColor(open.illustratorName) }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                >
                  {open.illustratorName[0]}
                </div>
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">
                    {open.illustratorName}
                  </div>
                  <div className="text-[12.5px] text-stone">
                    Họa sĩ · {open.illustratorWorkCount} tác phẩm
                  </div>
                </div>
                <Link
                  href={`/ket-noi?p=${open.illustratorId}`}
                  className="ml-auto whitespace-nowrap rounded-full border border-[#e2ded7] px-[18px] py-2.5 text-[13px] font-semibold text-brand-ink no-underline"
                >
                  Xem hồ sơ
                </Link>
              </div>
              <div className="mt-[22px] flex gap-[26px] border-y border-[#f1efec] py-[18px]">
                <div>
                  <div className="text-[22px] font-extrabold text-brand-ink">
                    {formatCount(likeCountOf(open.id))}
                  </div>
                  <div className="text-[12.5px] text-stone">Lượt thích</div>
                </div>
                <div>
                  <div className="text-[22px] font-extrabold text-brand-ink">
                    {formatCount(shareCountOf(open.id))}
                  </div>
                  <div className="text-[12.5px] text-stone">Chia sẻ</div>
                </div>
                {openRank > 0 && (
                  <div>
                    <div className="text-[22px] font-extrabold text-brand-ink">#{openRank}</div>
                    <div className="text-[12.5px] text-stone">Hạng hiện tại</div>
                  </div>
                )}
              </div>
              {open.description && (
                <p className="mt-[18px] text-sm leading-[1.65] text-stone-dark">{open.description}</p>
              )}
              <div className="mt-auto flex items-center gap-2.5 pt-6">
                <button
                  type="button"
                  onClick={() => toggleLike(open.id)}
                  style={{
                    background: likedByViewerOf(open.id) ? "var(--color-brand-ink)" : "var(--color-brand-gold)",
                    color: likedByViewerOf(open.id) ? "#fff" : "var(--color-brand-ink)",
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-colors"
                >
                  <HeartIcon weight="fill" />
                  {likedByViewerOf(open.id) ? "Đã thích" : "Thích"}
                </button>
                <button
                  type="button"
                  onClick={() => handleShare(open)}
                  className="flex cursor-pointer items-center gap-2 rounded-full border border-[#e2ded7] px-5 py-3 text-sm font-semibold text-brand-ink"
                >
                  <ShareNetworkIcon />
                  Chia sẻ
                </button>
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
