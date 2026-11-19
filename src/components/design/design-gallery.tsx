"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  HeartIcon,
  ShareNetworkIcon,
  ImageSquareIcon,
  ChatCircleIcon,
  CaretLeftIcon,
  CaretRightIcon,
  StackIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { DesignShareModal } from "@/components/design/design-share-modal";
import { ContentCommentsPanel } from "@/components/comments/content-comments-panel";
import {
  DESIGN_CATEGORIES,
  DESIGN_SORTS,
  DESIGN_SORT_DESCRIPTIONS,
  formatCount,
  type DesignSortKey,
  type GalleryDesignItem,
} from "@/lib/design/get-design-gallery";
import type { DesignItemCategory } from "@/lib/supabase/types";
import { ProtectedImage } from "@/components/ui/protected-image";

const AVATAR_COLORS = [
  "var(--color-brand-navy)",
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

export type GalleryEntry = {
  type: "album" | "single";
  key: string;
  albumId: string | null;
  albumName: string | null;
  albumDescription: string | null;
  artStyleLabel: string | null;
  coverItem: GalleryDesignItem;
  items: GalleryDesignItem[];
  likeCount: number;
  shareCount: number;
  likedByViewer: boolean;
  category: DesignItemCategory;
  createdAt: string;
  illustratorName: string;
  illustratorId: string;
  illustratorAvatarUrl: string | null;
};

export function DesignGallery({
  items,
  activeAlbum,
  detailItem,
}: {
  items: GalleryDesignItem[];
  detailItem?: GalleryDesignItem;
  /** /thiet-ke?album=<id> đang lọc — tên để hiện banner, xem thiet-ke/page.tsx. */
  activeAlbum?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [cat, setCat] = useState<CategoryFilter>("Tất cả");
  const [sort, setSort] = useState<DesignSortKey>("likes");
  const [openItem, setOpenItem] = useState<GalleryDesignItem | null>(detailItem ?? null);
  const [shareItem, setShareItem] = useState<{ item: GalleryDesignItem; url: string } | null>(null);
  const shareRecorded = useRef(false);
  const [commentsOpenId, setCommentsOpenId] = useState<string | null>(null);

  const [likeState, setLikeState] = useState<Record<string, LikeState>>(() =>
    Object.fromEntries(items.map((p) => [p.id, { liked: p.likedByViewer, count: p.likeCount }]))
  );
  const [shareCounts, setShareCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((p) => [p.id, p.shareCount]))
  );
  const [likePending, setLikePending] = useState<Record<string, boolean>>({});

  const likeCountOf = (id: string) => likeState[id]?.count ?? items.find((item) => item.id === id)?.likeCount ?? 0;
  const likedByViewerOf = (id: string) => likeState[id]?.liked ?? items.find((item) => item.id === id)?.likedByViewer ?? false;
  const shareCountOf = (id: string) => shareCounts[id] ?? items.find((item) => item.id === id)?.shareCount ?? 0;

  // History API: popstate closes the modal or updates current item
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (detailItem) return;
      if (e.state?.itemId) {
        const found = items.find((x) => x.id === e.state.itemId);
        if (found) setOpenItem(found);
        else setOpenItem(null);
      } else {
        setOpenItem(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [items, detailItem]);

  // Lock body scroll when modal is open on client-side navigation
  useEffect(() => {
    if (!detailItem && openItem) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [detailItem, openItem]);

  const handleOpenItem = (item: GalleryDesignItem) => {
    setOpenItem(item);
    if (typeof window !== "undefined") {
      window.history.pushState({ modal: true, itemId: item.id }, "", `/thiet-ke/${item.id}`);
    }
  };

  const handleCloseDetail = () => {
    if (detailItem) {
      if (typeof window !== "undefined" && window.history.length > 1) {
        window.history.back();
      } else {
        router.push("/thiet-ke");
      }
    } else {
      if (typeof window !== "undefined" && window.history.state?.modal) {
        window.history.back();
      } else {
        setOpenItem(null);
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", "/thiet-ke");
        }
      }
    }
  };

  // Group items by album for gallery grid
  const list: GalleryEntry[] = useMemo(() => {
    if (activeAlbum) {
      // If viewing a filtered album (/thiet-ke?album=xxx), show every item individually
      const filtered = items.filter((p) => cat === "Tất cả" || p.category === cat);
      const sorted = filtered.slice().sort((a, b) => {
        if (sort === "new") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sort === "shares") return shareCountOf(b.id) - shareCountOf(a.id);
        return likeCountOf(b.id) - likeCountOf(a.id);
      });
      return sorted.map((p) => ({
        type: "single",
        key: p.id,
        albumId: p.albumId,
        albumName: p.albumName,
        albumDescription: p.albumDescription,
        artStyleLabel: p.artStyleLabel,
        coverItem: p,
        items: [p],
        likeCount: likeCountOf(p.id),
        shareCount: shareCountOf(p.id),
        likedByViewer: likedByViewerOf(p.id),
        category: p.category,
        createdAt: p.createdAt,
        illustratorName: p.illustratorName,
        illustratorId: p.illustratorId,
        illustratorAvatarUrl: p.illustratorAvatarUrl,
      }));
    }

    // Normal gallery: group items by album_id
    const albumMap = new Map<string, GalleryDesignItem[]>();
    const singleItems: GalleryDesignItem[] = [];

    for (const item of items) {
      if (item.albumId) {
        const arr = albumMap.get(item.albumId) ?? [];
        arr.push(item);
        albumMap.set(item.albumId, arr);
      } else {
        singleItems.push(item);
      }
    }

    const entries: GalleryEntry[] = [];

    // Add album entries
    for (const [albumId, albumItems] of albumMap.entries()) {
      const matchesCategory = cat === "Tất cả" || albumItems.some((it) => it.category === cat);
      if (!matchesCategory) continue;

      const cover = albumItems[0];
      const totalLikes = albumItems.reduce((sum, it) => sum + likeCountOf(it.id), 0);
      const totalShares = albumItems.reduce((sum, it) => sum + shareCountOf(it.id), 0);
      const anyLiked = albumItems.some((it) => likedByViewerOf(it.id));
      const latestCreated = albumItems.reduce(
        (latest, it) => (new Date(it.createdAt) > new Date(latest) ? it.createdAt : latest),
        cover.createdAt
      );

      entries.push({
        type: "album",
        key: `album-${albumId}`,
        albumId,
        albumName: cover.albumName,
        albumDescription: cover.albumDescription,
        artStyleLabel: cover.artStyleLabel,
        coverItem: cover,
        items: albumItems,
        likeCount: totalLikes,
        shareCount: totalShares,
        likedByViewer: anyLiked,
        category: cover.category,
        createdAt: latestCreated,
        illustratorName: cover.illustratorName,
        illustratorId: cover.illustratorId,
        illustratorAvatarUrl: cover.illustratorAvatarUrl,
      });
    }

    // Add single items
    for (const item of singleItems) {
      if (cat !== "Tất cả" && item.category !== cat) continue;
      entries.push({
        type: "single",
        key: item.id,
        albumId: null,
        albumName: null,
        albumDescription: null,
        artStyleLabel: null,
        coverItem: item,
        items: [item],
        likeCount: likeCountOf(item.id),
        shareCount: shareCountOf(item.id),
        likedByViewer: likedByViewerOf(item.id),
        category: item.category,
        createdAt: item.createdAt,
        illustratorName: item.illustratorName,
        illustratorId: item.illustratorId,
        illustratorAvatarUrl: item.illustratorAvatarUrl,
      });
    }

    // Sort entries
    return entries.sort((a, b) => {
      if (sort === "new") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "shares") return b.shareCount - a.shareCount;
      return b.likeCount - a.likeCount;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cat, sort, activeAlbum, likeState, shareCounts]);

  // Siblings in the currently open album
  const activeAlbumItems = useMemo(() => {
    if (!openItem) return [];
    if (!openItem.albumId) return [openItem];
    const siblings = items.filter((x) => x.albumId === openItem.albumId);
    return siblings.length > 0 ? siblings : [openItem];
  }, [openItem, items]);

  const activeIndex = useMemo(() => {
    if (!openItem || activeAlbumItems.length === 0) return 0;
    const idx = activeAlbumItems.findIndex((x) => x.id === openItem.id);
    return idx >= 0 ? idx : 0;
  }, [openItem, activeAlbumItems]);

  const currentItem = activeAlbumItems[activeIndex] ?? openItem;

  const goToIndex = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= activeAlbumItems.length) return;
    const nextItem = activeAlbumItems[newIndex];
    if (!nextItem) return;
    setOpenItem(nextItem);
    if (typeof window !== "undefined") {
      window.history.replaceState({ modal: true, itemId: nextItem.id }, "", `/thiet-ke/${nextItem.id}`);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!openItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        goToIndex(activeIndex - 1);
      } else if (e.key === "ArrowRight") {
        goToIndex(activeIndex + 1);
      } else if (e.key === "Escape") {
        handleCloseDetail();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItem, activeIndex, activeAlbumItems]);

  // Touch swipe navigation for mobile
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && activeIndex < activeAlbumItems.length - 1) {
        goToIndex(activeIndex + 1);
      } else if (deltaX > 0 && activeIndex > 0) {
        goToIndex(activeIndex - 1);
      }
    }
  };

  const toggleLike = async (id: string) => {
    if (likePending[id]) return;
    setLikePending((prev) => ({ ...prev, [id]: true }));
    setLikeState((prev) => {
      const cur = prev[id] ?? { liked: false, count: 0 };
      return { ...prev, [id]: { liked: !cur.liked, count: cur.count + (cur.liked ? -1 : 1) } };
    });
    try {
      const res = await fetch(`/api/design/${id}/like`, { method: "POST" });
      if (res.status === 401) {
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

  const handleShare = (item: GalleryDesignItem) => {
    shareRecorded.current = false;
    setShareItem({ item, url: `${window.location.origin}/thiet-ke/${item.id}` });
  };

  const recordShare = async (id: string) => {
    if (shareRecorded.current) return;
    shareRecorded.current = true;
    try {
      const res = await fetch(`/api/design/${id}/share`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data) setShareCounts((prev) => ({ ...prev, [id]: data.shareCount ?? prev[id] }));
    } catch {
      // Ignored
    }
  };

  const renderDetailCard = (item: GalleryDesignItem) => {
    const hasMultiple = activeAlbumItems.length > 1;
    const isLiked = likedByViewerOf(item.id);
    const likeCount = likeCountOf(item.id);
    const shareCount = shareCountOf(item.id);

    return (
      <div className="grid w-full overflow-hidden rounded-[22px] border border-line bg-surface sm:grid-cols-[1.15fr_minmax(0,1fr)]">
        {/* Cột trái: Ảnh + Carousel controls + Pagination Dots */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="relative flex min-h-[280px] w-full select-none flex-col items-center justify-center bg-black/5 dark:bg-black/30 sm:min-h-[500px]"
        >
          <ProtectedImage
            src={item.imageUrl}
            alt={item.title}
            displayWidth={640}
            wrapperClassName="min-h-[220px] w-full sm:min-h-[460px]"
            className="h-full min-h-[220px] w-full object-contain sm:min-h-[460px]"
          />

          {/* Album count badge */}
          {hasMultiple && (
            <div className="absolute right-3.5 top-3.5 z-20 rounded-full bg-black/60 px-3 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
              {activeIndex + 1} / {activeAlbumItems.length}
            </div>
          )}

          {/* Prev button */}
          {hasMultiple && activeIndex > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToIndex(activeIndex - 1);
              }}
              aria-label="Ảnh trước"
              className="absolute left-3.5 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-surface/90 text-brand-ink shadow-md transition-colors hover:bg-brand-gold"
            >
              <CaretLeftIcon size={20} weight="bold" />
            </button>
          )}

          {/* Next button */}
          {hasMultiple && activeIndex < activeAlbumItems.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToIndex(activeIndex + 1);
              }}
              aria-label="Ảnh tiếp theo"
              className="absolute right-3.5 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-surface/90 text-brand-ink shadow-md transition-colors hover:bg-brand-gold"
            >
              <CaretRightIcon size={20} weight="bold" />
            </button>
          )}

          {/* Pagination Dots */}
          {hasMultiple && (
            <div className="absolute bottom-3 left-0 right-0 z-20 flex items-center justify-center px-4">
              <div className="flex max-w-[90%] flex-wrap items-center justify-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur-xs">
                {activeAlbumItems.map((dotItem, idx) => (
                  <button
                    key={dotItem.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToIndex(idx);
                    }}
                    aria-label={`Ảnh ${idx + 1}`}
                    className={`cursor-pointer rounded-full transition-all duration-200 ${
                      idx === activeIndex ? "h-2 w-5 bg-brand-gold" : "h-2 w-2 bg-white/50 hover:bg-white/80"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cột phải: Thông tin tác phẩm & tương tác */}
        <div className="flex flex-col p-6 pb-6 sm:p-[34px] sm:pb-[30px]">
          <div className="flex items-center justify-between">
            <div className="text-[11.5px] font-semibold tracking-[1.2px] text-brand-gold-dark">
              {item.categoryLabel.toUpperCase()}
              {item.artStyleLabel && <span className="text-stone"> · {item.artStyleLabel}</span>}
            </div>
            {!detailItem && (
              <button
                type="button"
                onClick={handleCloseDetail}
                aria-label="Đóng"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-stone transition-colors hover:bg-neutral-bg hover:text-brand-ink"
              >
                <XIcon size={18} weight="bold" />
              </button>
            )}
          </div>

          <h1 className="mt-2.5 font-[family-name:var(--font-lora)] text-[26px] font-bold leading-[1.3] text-brand-ink">
            {item.albumName ? item.albumName : item.title}
          </h1>

          {item.albumName && item.title !== item.albumName && (
            <div className="mt-1 text-sm font-medium text-stone-dark">
              {item.title}
            </div>
          )}

          {item.albumName && (
            <Link
              href={`/thiet-ke?album=${item.albumId}`}
              className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-neutral-bg px-3 py-1 text-[12px] font-semibold text-brand-ink no-underline hover:bg-surface-gold"
            >
              Album: {item.albumName}
              {hasMultiple && <span className="text-stone">({activeAlbumItems.length} ảnh)</span>}
            </Link>
          )}

          <div className="mt-[18px] flex items-center gap-[11px]">
            <div
              style={{ background: avatarColor(item.illustratorName) }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
            >
              {item.illustratorName[0]}
            </div>
            <div>
              <div className="text-[14.5px] font-semibold text-ink">{item.illustratorName}</div>
              <div className="text-[12.5px] text-stone">Họa sĩ</div>
            </div>
            <Link
              href={`/ket-noi?p=${item.illustratorId}`}
              className="ml-auto whitespace-nowrap rounded-full border border-line px-[18px] py-2.5 text-[13px] font-semibold text-brand-ink no-underline hover:border-brand-gold hover:bg-surface-gold"
            >
              Xem hồ sơ
            </Link>
          </div>

          <div className="mt-[22px] flex gap-[26px] border-y border-line-soft py-[18px]">
            <div>
              <div className="text-[22px] font-extrabold text-brand-ink">{formatCount(likeCount)}</div>
              <div className="text-[12.5px] text-stone">Lượt thích ảnh này</div>
            </div>
            <div>
              <div className="text-[22px] font-extrabold text-brand-ink">{formatCount(shareCount)}</div>
              <div className="text-[12.5px] text-stone">Chia sẻ</div>
            </div>
          </div>

          {(item.description || item.albumDescription) && (
            <p className="mt-[18px] text-sm leading-[1.65] text-stone-dark">
              {item.albumId ? item.albumDescription : item.description}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-6">
            <button
              type="button"
              onClick={() => toggleLike(item.id)}
              style={{
                background: isLiked ? "var(--color-brand-navy)" : "var(--color-brand-gold)",
                color: isLiked ? "#fff" : "var(--color-brand-navy)",
              }}
              className="flex cursor-pointer items-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-colors"
            >
              <HeartIcon weight="fill" />
              {isLiked ? "Đã thích" : "Thích"}
            </button>
            <button
              type="button"
              onClick={() => handleShare(item)}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-5 py-3 text-sm font-semibold text-brand-ink transition-colors hover:border-brand-gold hover:bg-surface-gold"
            >
              <ShareNetworkIcon />
              Chia sẻ ảnh này
            </button>
            <button
              type="button"
              onClick={() => setCommentsOpenId(item.id)}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-5 py-3 text-sm font-semibold text-brand-ink transition-colors hover:border-brand-gold hover:bg-surface-gold"
            >
              <ChatCircleIcon />
              Bình luận
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 1. Gallery list (hidden only in direct SSR detail page) */}
      {!detailItem && (
        <>
          <section className="flex flex-wrap items-end justify-between gap-6 px-11 pt-9">
            <div>
              <div className="text-xs font-semibold tracking-[1.4px] text-brand-gold-dark">THƯ VIỆN THIẾT KẾ</div>
              <h1 className="mt-2 max-w-[620px] font-[family-name:var(--font-lora)] text-[34px] font-bold leading-[1.2] text-brand-ink">
                Ảnh bìa và minh họa được cộng đồng yêu thích nhất
              </h1>
              <p className="mt-2.5 max-w-[560px] text-[14.5px] leading-[1.6] text-stone-dark">
                Xếp theo lượt thích và lượt chia sẻ thật từ cộng đồng. Mọi tác phẩm đều gắn dấu chìm của họa sĩ.
              </p>
            </div>
            <div className="flex shrink-0 gap-2 rounded-full bg-neutral-bg p-[5px]">
              {DESIGN_SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSort(s.key)}
                  style={{
                    background: s.key === sort ? "var(--color-surface)" : "transparent",
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

          {activeAlbum && (
            <div className="mx-11 mt-5 flex items-center justify-between gap-3 rounded-xl bg-surface-gold px-4 py-2.5 text-[13px] text-brand-ink">
              <span>
                Đang xem album <strong>{activeAlbum.name}</strong>
              </span>
              <Link href="/thiet-ke" className="whitespace-nowrap font-semibold text-brand-gold-dark no-underline">
                Xem tất cả
              </Link>
            </div>
          )}

          <div className="flex flex-wrap gap-2.5 px-11 pb-1 pt-6">
            {CATEGORY_FILTERS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCat(c.key)}
                className={`cursor-pointer rounded-full px-[18px] py-2.5 text-sm font-medium transition-colors ${
                  c.key === cat ? "bg-brand-navy text-white" : "bg-neutral-bg text-ink-soft"
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
              : `${list.length} mục · xếp theo ${DESIGN_SORT_DESCRIPTIONS[sort]}`}
          </div>

          {list.length === 0 ? (
            <div className="mx-11 my-8 rounded-2xl border border-dashed border-line px-8 py-14 text-center">
              <p className="text-sm text-stone-dark">Chưa có ai đăng thiết kế ở mục này. Là người đầu tiên?</p>
              <Link
                href="/thiet-ke/new"
                className="mt-4 inline-block rounded-full bg-brand-gold px-6 py-2.5 text-sm font-semibold text-brand-navy no-underline"
              >
                Đăng thiết kế
              </Link>
            </div>
          ) : (
            <div className="px-11 pb-2 pt-[18px]">
              <div style={{ columnWidth: 270, columnGap: 18 }}>
                {list.map((entry, i) => {
                  const showRank = i < 3 && sort !== "new";
                  const p = entry.coverItem;
                  const isAlbum = entry.items.length > 1;

                  return (
                    <div
                      key={entry.key}
                      onClick={(e) => {
                        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                          e.preventDefault();
                          handleOpenItem(p);
                        }
                      }}
                      className="group relative mb-[18px] block cursor-pointer break-inside-avoid overflow-hidden rounded-2xl bg-neutral-bg transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <Link
                        href={`/thiet-ke/${p.id}`}
                        aria-label={`Xem ${entry.albumName || p.title}`}
                        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-brand-gold"
                      />
                      <ProtectedImage
                        src={p.imageUrl}
                        displayWidth={320}
                        alt={entry.albumName || p.title}
                        className="block w-full"
                        loading="lazy"
                      />

                      {/* Rank badge */}
                      {showRank && (
                        <div className="absolute left-3 top-3 z-20 rounded-full bg-brand-gold px-2.5 py-1 text-[11px] font-bold tracking-[.5px] text-brand-navy shadow-xs">
                          TOP {i + 1}
                        </div>
                      )}

                      {/* Album badge: N ảnh */}
                      {isAlbum && (
                        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-brand-ink-dark/80 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs backdrop-blur-xs">
                          <StackIcon size={14} weight="bold" /> {entry.items.length} ảnh
                        </div>
                      )}

                      {/* Like & Share quick buttons on hover */}
                      <div className="absolute right-3 bottom-16 z-20 flex -translate-y-1.5 gap-2 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLike(p.id);
                          }}
                          style={likedByViewerOf(p.id) ? { background: "var(--color-brand-gold)" } : undefined}
                          className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full bg-surface/94 text-brand-ink shadow-sm transition-colors hover:bg-brand-gold"
                        >
                          <HeartIcon weight={likedByViewerOf(p.id) ? "fill" : "regular"} size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShare(p);
                          }}
                          className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full bg-surface/94 text-brand-ink shadow-sm transition-colors hover:bg-brand-gold"
                        >
                          <ShareNetworkIcon size={16} />
                        </button>
                      </div>

                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-ink-dark/0 from-[38%] to-brand-ink-dark/86 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

                      <div className="absolute inset-x-0 bottom-0 p-4 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <div className="truncate text-[15px] font-semibold leading-[1.35]">
                          {entry.albumName || p.title}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-[12.5px] font-medium text-[#dbe4e8]">
                          <span className="flex min-w-0 items-center gap-[7px]">
                            <span
                              style={{ background: avatarColor(entry.illustratorName) }}
                              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            >
                              {entry.illustratorName[0]}
                            </span>
                            <span className="truncate">{entry.illustratorName}</span>
                          </span>
                          {entry.albumName && (
                            <span className="relative z-20 truncate rounded-full bg-white/18 px-2 py-0.5 text-[11px] font-semibold text-white">
                              {entry.albumName}
                            </span>
                          )}
                          <span className="flex shrink-0 gap-3">
                            <span className="flex items-center gap-1">
                              <HeartIcon weight="fill" color="var(--color-brand-gold-light)" />
                              {formatCount(entry.likeCount)}
                            </span>
                            <span className="flex items-center gap-1">
                              <ShareNetworkIcon />
                              {formatCount(entry.shareCount)}
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
        </>
      )}

      {/* 2. Modal detail view (Client-side instant modal when browsing gallery) */}
      {!detailItem && openItem && (
        <div
          onClick={handleCloseDetail}
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-brand-ink-dark/65 p-4 backdrop-blur-xs sm:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-auto w-full max-w-[1100px] shadow-[0_24px_60px_rgba(0,0,0,.3)]"
          >
            {renderDetailCard(currentItem)}
          </div>
        </div>
      )}

      {/* 3. Direct SSR detail page view */}
      {detailItem && (
        <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
          {renderDetailCard(currentItem)}
        </div>
      )}

      {/* Share Modal */}
      {shareItem && (
        <DesignShareModal
          key={shareItem.item.id}
          id={shareItem.item.id}
          title={shareItem.item.title}
          url={shareItem.url}
          onClose={() => setShareItem(null)}
          onShared={() => {
            void recordShare(shareItem.item.id);
          }}
        />
      )}

      {/* Comments Panel */}
      {commentsOpenId && (
        <ContentCommentsPanel
          title="Bình luận tác phẩm"
          apiBase={`/api/design/${commentsOpenId}`}
          onClose={() => setCommentsOpenId(null)}
        />
      )}
    </>
  );
}
