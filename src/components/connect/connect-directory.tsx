"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  MagnifyingGlassIcon,
  CaretRightIcon,
  CaretDownIcon,
  CaretUpIcon,
  SealCheckIcon,
  UploadSimpleIcon,
  HeartIcon,
  BookOpenTextIcon,
  WaveformIcon,
  ArticleIcon,
  PaletteIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  TAGS,
  TAG_META,
  SECTION_KEYS,
  SECTION_META,
  PEOPLE,
  SIMULATED_ITEMS,
  type Tag,
  type SectionKey,
  type WorkItem,
} from "@/lib/connect-directory";
import { Field, Alert } from "@/components/ui";

const SECTION_ICONS: Record<SectionKey, typeof BookOpenTextIcon> = {
  truyen: BookOpenTextIcon,
  audio: WaveformIcon,
  blog: ArticleIcon,
  design: PaletteIcon,
};

function pickRandomSection(): SectionKey {
  return SECTION_KEYS[Math.floor(Math.random() * SECTION_KEYS.length)];
}

export function ConnectDirectory() {
  const searchParams = useSearchParams();
  const linkedId = searchParams.get("p");
  const initialId =
    (linkedId && PEOPLE.some((p) => p.id === linkedId) ? linkedId : null) ?? PEOPLE[0].id;

  const [tag, setTag] = useState<Tag>("Tất cả");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialId);
  const [follow, setFollow] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    truyen: true,
    audio: false,
    blog: false,
    design: false,
  });
  const [extra, setExtra] = useState<Record<string, Partial<Record<SectionKey, WorkItem[]>>>>({});

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PEOPLE.filter(
      (p) =>
        (tag === "Tất cả" || p.tags.includes(tag)) &&
        (!q || p.name.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q))
    );
  }, [tag, query]);

  const selected = PEOPLE.find((p) => p.id === selectedId) ?? PEOPLE[0];
  const selectedExtra = extra[selected.id] ?? {};

  const itemsFor = (key: SectionKey): WorkItem[] =>
    (selectedExtra[key] ?? []).concat(selected.works[key]);

  const openCount = SECTION_KEYS.filter((k) => open[k]).length;
  const isFollowing = !!follow[selected.id];

  const toggleFollow = () =>
    setFollow((prev) => ({ ...prev, [selected.id]: !prev[selected.id] }));

  const toggleSection = (key: SectionKey) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleAll = () => {
    const next = openCount !== SECTION_KEYS.length;
    setOpen({ truyen: next, audio: next, blog: next, design: next });
  };

  const simulatePost = () => {
    const key = pickRandomSection();
    const item: WorkItem = { ...SIMULATED_ITEMS[key], likes: "0", date: "Hôm nay", isNew: true };
    setExtra((prev) => {
      const personExtra = { ...(prev[selected.id] ?? {}) };
      personExtra[key] = [item, ...(personExtra[key] ?? [])];
      return { ...prev, [selected.id]: personExtra };
    });
    setOpen((prev) => ({ ...prev, [key]: true }));
  };

  return (
    <>
      <section className="px-11 pt-9">
        <div className="text-xs font-semibold tracking-[1.4px] text-brand-gold-dark">KẾT NỐI</div>
        <h1 className="mt-2 max-w-[620px] font-[family-name:var(--font-lora)] text-[34px] font-bold leading-[1.2] text-brand-ink">
          Những người đang làm nên Vịnh
        </h1>
        <p className="mt-2.5 max-w-[600px] text-[14.5px] leading-[1.6] text-stone-dark">
          Tác giả, người lồng tiếng, họa sĩ, blogger và độc giả. Chọn một
          người để xem toàn bộ sản phẩm của họ.
        </p>
      </section>

      <div className="grid gap-[30px] px-11 pb-[46px] pt-[26px] lg:grid-cols-[320px_1fr]">
        {/* People list */}
        <div className="rounded-[20px] border border-cream overflow-hidden">
          <div className="border-b border-[#f1efec] px-[18px] pb-3 pt-4">
            <div className="mb-3 rounded-full bg-neutral-bg px-[15px] py-2.5">
              <Field
                label={null}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên hoặc @tên tài khoản"
                className="border-none bg-transparent px-0 py-0 text-[13.5px] text-ink placeholder:text-[#9a9a9a] focus:border-transparent"
                suffix={<MagnifyingGlassIcon className="text-[#9a9a9a]" size={16} />}
              />
            </div>
            <div className="flex flex-wrap gap-[7px]">
              {TAGS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setTag(label)}
                  className={`cursor-pointer whitespace-nowrap rounded-full px-3.5 py-[7px] text-[12.5px] font-medium transition-colors ${
                    label === tag ? "bg-brand-ink text-white" : "bg-neutral-bg text-[#3a3a3a]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[760px] overflow-y-auto">
            {filteredPeople.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                style={{
                  borderLeft: p.id === selected.id ? "3px solid #D9A441" : "3px solid transparent",
                  background: p.id === selected.id ? "var(--color-cream-card)" : "#fff",
                }}
                className="flex w-full cursor-pointer items-center gap-3.5 border-b border-[#f4f2ef] px-[18px] py-3.5 text-left transition-colors hover:bg-cream-card"
              >
                <div
                  style={{ background: p.gradient }}
                  className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-[18px] font-bold text-white"
                >
                  {p.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[7px]">
                    <div className="truncate text-[15px] font-semibold text-ink">
                      {p.name}
                    </div>
                    {p.verified && (
                      <SealCheckIcon weight="fill" size={15} className="shrink-0 text-brand-gold" />
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-stone">
                    {p.handle} · {p.followers} người theo dõi
                  </div>
                  <div className="mt-[7px] flex flex-wrap gap-[5px]">
                    {p.tags.map((t) => (
                      <span
                        key={t}
                        style={{ background: TAG_META[t].bg, color: TAG_META[t].fg }}
                        className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <CaretRightIcon size={14} className="shrink-0 text-[#c9c1b6]" />
              </button>
            ))}
            {filteredPeople.length === 0 && (
              <div className="p-[30px_18px]">
                <Alert tone="info">Không tìm thấy người dùng phù hợp.</Alert>
              </div>
            )}
          </div>
        </div>

        {/* Profile panel */}
        <div className="rounded-[20px] border border-cream overflow-hidden">
          <div className="flex flex-wrap items-start gap-[18px] bg-brand-ink-dark p-[28px_30px] text-white">
            <div
              style={{ background: selected.gradient }}
              className="flex h-[70px] w-[70px] shrink-0 items-center justify-center rounded-full text-[28px] font-bold text-white"
            >
              {selected.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[9px]">
                <div className="whitespace-nowrap font-[family-name:var(--font-lora)] text-2xl font-bold">
                  {selected.name}
                </div>
                {selected.verified && (
                  <SealCheckIcon weight="fill" size={19} className="text-brand-gold-light" />
                )}
              </div>
              <div className="mt-1 truncate text-[13.5px] text-sidebar-text-dim-2">
                {selected.handle} · Tham gia {selected.joined}
              </div>
              <div className="mt-[11px] flex flex-wrap gap-1.5">
                {selected.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-white/14 px-3 py-1 text-[11.5px] font-semibold text-brand-gold-light"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="mt-3.5 max-w-[620px] text-sm leading-[1.6] text-sidebar-text">
                {selected.bio}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-[9px]">
              <button
                type="button"
                onClick={toggleFollow}
                style={{
                  background: isFollowing ? "rgba(255,255,255,.14)" : "var(--color-brand-gold)",
                  color: isFollowing ? "#fff" : "var(--color-brand-ink)",
                }}
                className="cursor-pointer whitespace-nowrap rounded-full px-[26px] py-2.5 text-center text-[13.5px] font-bold transition-colors"
              >
                {isFollowing ? "Đang theo dõi" : "Theo dõi"}
              </button>
              <span className="cursor-default whitespace-nowrap rounded-full border border-white/28 px-[22px] py-2.5 text-center text-[13.5px] font-semibold text-white">
                Nhắn tin
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-[#f1efec] sm:grid-cols-4">
            {SECTION_KEYS.map((key, i) => (
              <div
                key={key}
                style={{ borderRight: i < 3 ? "1px solid #f1efec" : "none" }}
                className="px-5 py-4"
              >
                <div className="text-[22px] font-extrabold text-brand-ink">
                  {itemsFor(key).length}
                </div>
                <div className="mt-0.5 text-[12.5px] text-stone">
                  {SECTION_META[key].label}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] pt-[18px]">
            <div className="truncate text-xs font-bold tracking-[1.1px] text-stone">
              SẢN PHẨM CỦA {selected.name.toUpperCase()}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={simulatePost}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-brand-gold px-[15px] py-2 text-[12.5px] font-semibold text-brand-gold-dark"
              >
                <UploadSimpleIcon /> Mô phỏng đăng tác phẩm
              </button>
              <button
                type="button"
                onClick={toggleAll}
                className="shrink-0 cursor-pointer whitespace-nowrap text-[13px] font-semibold text-brand-ink"
              >
                {openCount === SECTION_KEYS.length ? "Thu gọn tất cả" : "Mở rộng tất cả"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-[22px] pb-[26px] pt-1.5">
            {SECTION_KEYS.map((key) => {
              const meta = SECTION_META[key];
              const Icon = SECTION_ICONS[key];
              const its = itemsFor(key);
              const isOpen = open[key];
              return (
                <div key={key} className="overflow-hidden rounded-2xl border border-cream">
                  <button
                    type="button"
                    onClick={() => toggleSection(key)}
                    className="flex w-full cursor-pointer items-center gap-3.5 bg-[#FAFAF9] px-[18px] py-[15px] text-left transition-colors hover:bg-[#F3F5F6]"
                  >
                    <div
                      style={{ background: meta.bg, color: meta.color }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-lg"
                    >
                      <Icon />
                    </div>
                    <div className="flex-1">
                      <div className="text-[15.5px] font-bold text-brand-ink">{meta.label}</div>
                      <div className="mt-0.5 text-[12.5px] text-stone">{meta.sub}</div>
                    </div>
                    <span
                      style={{
                        background: its.length ? meta.bg : "var(--color-neutral-bg)",
                        color: its.length ? meta.color : "var(--color-stone-light)",
                      }}
                      className="rounded-full px-3 py-1 text-[12.5px] font-bold"
                    >
                      {its.length}
                    </span>
                    {isOpen ? (
                      <CaretUpIcon className="shrink-0 text-stone" size={16} />
                    ) : (
                      <CaretDownIcon className="shrink-0 text-stone" size={16} />
                    )}
                  </button>
                  {isOpen && (
                    <div>
                      {its.map((it, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3.5 border-t border-[#f4f2ef] px-[18px] py-3.5 transition-colors hover:bg-cream-card"
                        >
                          <div
                            style={{ background: it.gradient }}
                            className="h-11 w-11 shrink-0 rounded-[9px]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-[14.5px] font-semibold text-ink">
                                {it.title}
                              </div>
                              {it.isNew && (
                                <span className="shrink-0 rounded-full bg-brand-gold px-2 py-0.5 text-[9.5px] font-bold tracking-[.5px] text-brand-ink">
                                  MỚI
                                </span>
                              )}
                            </div>
                            <div className="mt-[3px] text-[12.5px] text-stone">{it.meta}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-3.5 text-[12.5px] font-medium text-stone-light">
                            <span className="flex items-center gap-1">
                              <HeartIcon weight="fill" className="text-brand-gold" /> {it.likes}
                            </span>
                            <span>{it.date}</span>
                          </div>
                        </div>
                      ))}
                      {its.length === 0 && (
                        <div className="border-t border-[#f4f2ef] px-[18px] py-5 text-[13px] text-stone-light">
                          Chưa có sản phẩm nào trong mục này.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
