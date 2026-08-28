"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  MagnifyingGlassIcon,
  CaretRightIcon,
  CaretDownIcon,
  CaretUpIcon,
  BookOpenTextIcon,
  WaveformIcon,
  PaletteIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Field, Alert } from "@/components/ui";
import { AVATAR_TONES } from "@/lib/profile";
import type { CreatorTag } from "@/lib/supabase/types";

export type ConnectWorkItem = {
  id: string;
  title: string;
  meta: string;
  date: string;
  href: string | null;
  imageUrl: string | null;
  audioUrl?: string | null;
};

export type ConnectPerson = {
  id: string;
  nickname: string;
  username: string;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  bio: string | null;
  joined: string;
  creatorTags: CreatorTag[];
  followerCount: number;
  isFollowingByViewer: boolean;
  works: {
    truyen: ConnectWorkItem[];
    audio: ConnectWorkItem[];
    design: ConnectWorkItem[];
  };
};

const SECTION_KEYS = ["truyen", "audio", "design"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_META: Record<SectionKey, { label: string; sub: string; color: string; bg: string }> = {
  truyen: { label: "Truyện chữ", sub: "Tác phẩm văn bản đã xuất bản trên Vịnh", color: "#2C5870", bg: "var(--color-info-bg)" },
  audio: { label: "Audio", sub: "Bản thu và chương audio", color: "#2C7453", bg: "#DBF3E8" },
  design: { label: "Design", sub: "Ảnh bìa, minh họa đã đăng", color: "#6B21A8", bg: "#F3E8FF" },
};

const SECTION_ICONS: Record<SectionKey, typeof BookOpenTextIcon> = {
  truyen: BookOpenTextIcon,
  audio: WaveformIcon,
  design: PaletteIcon,
};

const CREATOR_TAG_LABELS: Record<CreatorTag, string> = {
  author: "Tác giả",
  illustrator: "Họa sĩ",
  narrator: "Lồng tiếng",
};

const FILTER_TAGS = ["Tất cả", "Đọc giả", "Tác giả", "Họa sĩ", "Lồng tiếng"] as const;
type FilterTag = (typeof FILTER_TAGS)[number];

// creator_tags là tự khai báo thủ công (chưa có UI nào để user tự set,
// xuất bản sách cũng KHÔNG tự động thêm 'author') — nên gần như luôn
// rỗng dù người đó đã có tác phẩm thật. Union thêm nhãn suy ra trực tiếp
// từ works (đã có sẵn dữ liệu thật) để không hiện sai "Đọc giả" cho
// người rõ ràng đã đăng truyện/audio/thiết kế.
function tagsOf(p: ConnectPerson): string[] {
  const declared = p.creatorTags.map((t) => CREATOR_TAG_LABELS[t]);
  const derived: string[] = [];
  if (p.works.truyen.length > 0) derived.push("Tác giả");
  if (p.works.audio.length > 0) derived.push("Lồng tiếng");
  if (p.works.design.length > 0) derived.push("Họa sĩ");
  const tags = [...new Set([...declared, ...derived])];
  return tags.length > 0 ? tags : ["Đọc giả"];
}

function toneFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function Avatar({ person, size }: { person: ConnectPerson; size: number }) {
  if (person.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.avatarUrl}
        alt={person.nickname}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ background: toneFor(person.id), width: size, height: size, fontSize: size * 0.4 }}
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
    >
      {person.nickname[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

type ConnectDirectoryProps = { people: ConnectPerson[]; viewerId: string | null };

export function ConnectDirectory({ people, viewerId }: ConnectDirectoryProps) {
  const searchParams = useSearchParams();
  const linkedId = searchParams.get("p");
  const initialId =
    (linkedId && people.some((p) => p.id === linkedId) ? linkedId : null) ?? people[0]?.id ?? null;

  const [tag, setTag] = useState<FilterTag>("Tất cả");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialId);
  const [followOverrides, setFollowOverrides] = useState<Record<string, boolean>>({});
  const [followPending, setFollowPending] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ truyen: true, audio: false, design: false });

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(
      (p) =>
        (tag === "Tất cả" || tagsOf(p).includes(tag)) &&
        (!q || p.nickname.toLowerCase().includes(q) || p.username.toLowerCase().includes(q))
    );
  }, [people, tag, query]);

  const selected = people.find((p) => p.id === selectedId) ?? people[0] ?? null;

  const openCount = SECTION_KEYS.filter((k) => open[k]).length;
  const isFollowing = selected ? (followOverrides[selected.id] ?? selected.isFollowingByViewer) : false;
  const isSelf = !!selected && selected.id === viewerId;

  const toggleFollow = async () => {
    if (!selected || isSelf || followPending[selected.id]) return;
    const prev = isFollowing;
    setFollowPending((p) => ({ ...p, [selected.id]: true }));
    setFollowOverrides((p) => ({ ...p, [selected.id]: !prev }));
    try {
      const res = await fetch(`/api/authors/${selected.id}/follow`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data) setFollowOverrides((p) => ({ ...p, [selected.id]: !!data.following }));
      else setFollowOverrides((p) => ({ ...p, [selected.id]: prev }));
    } catch {
      setFollowOverrides((p) => ({ ...p, [selected.id]: prev }));
    } finally {
      setFollowPending((p) => ({ ...p, [selected.id]: false }));
    }
  };

  const toggleSection = (key: SectionKey) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleAll = () => {
    const next = openCount !== SECTION_KEYS.length;
    setOpen({ truyen: next, audio: next, design: next });
  };

  return (
    <>
      <section className="px-4 pt-9 sm:px-8 lg:px-11">
        <div className="text-xs font-semibold tracking-[1.4px] text-brand-gold-dark">KẾT NỐI</div>
        <h1 className="mt-2 max-w-[620px] font-[family-name:var(--font-lora)] text-[28px] font-bold leading-[1.2] text-brand-ink sm:text-[34px]">
          Những người đang làm nên Vịnh
        </h1>
        <p className="mt-2.5 max-w-[600px] text-[14.5px] leading-[1.6] text-stone-dark">
          Tác giả, người lồng tiếng, họa sĩ và độc giả. Chọn một người để xem toàn bộ tác phẩm đã đăng của họ.
        </p>
      </section>

      {people.length === 0 ? (
        <div className="px-4 pb-[46px] pt-[26px] sm:px-8 lg:px-11">
          <Alert tone="info">Chưa có người dùng nào để hiển thị.</Alert>
        </div>
      ) : (
        <div className="grid gap-[30px] px-4 pb-[46px] pt-[26px] sm:px-8 lg:grid-cols-[320px_1fr] lg:px-11">
          {/* People list */}
          <div className="overflow-hidden rounded-[20px] border border-cream">
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
                {FILTER_TAGS.map((label) => (
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
                    borderLeft: p.id === selected?.id ? "3px solid #D9A441" : "3px solid transparent",
                    background: p.id === selected?.id ? "var(--color-cream-card)" : "#fff",
                  }}
                  className="flex w-full cursor-pointer items-center gap-3.5 border-b border-[#f4f2ef] px-[18px] py-3.5 text-left transition-colors hover:bg-cream-card"
                >
                  <Avatar person={p} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-ink">{p.nickname}</div>
                    <div className="mt-0.5 truncate text-[12.5px] text-stone">
                      @{p.username} · {p.followerCount.toLocaleString("vi-VN")} người theo dõi
                    </div>
                    <div className="mt-[7px] flex flex-wrap gap-[5px]">
                      {tagsOf(p).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-info-bg px-2.5 py-[3px] text-[11px] font-semibold text-[#2C5870]"
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
          {selected && (
            <div className="overflow-hidden rounded-[20px] border border-cream">
              <div className="flex flex-wrap items-start gap-[18px] bg-brand-ink-dark p-[22px] text-white sm:p-[28px_30px]">
                <Avatar person={selected} size={70} />
                <div className="min-w-0 flex-1">
                  <div className="whitespace-nowrap font-[family-name:var(--font-lora)] text-2xl font-bold">
                    {selected.nickname}
                  </div>
                  <div className="mt-1 truncate text-[13.5px] text-sidebar-text-dim-2">
                    @{selected.username} · Tham gia {selected.joined}
                  </div>
                  <div className="mt-[11px] flex flex-wrap gap-1.5">
                    {tagsOf(selected).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-white/14 px-3 py-1 text-[11.5px] font-semibold text-brand-gold-light"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  {selected.bio && (
                    <div className="mt-3.5 max-w-[620px] text-sm leading-[1.6] text-sidebar-text">
                      {selected.bio}
                    </div>
                  )}
                </div>
                {!isSelf && (
                  <div className="flex shrink-0 flex-col gap-[9px]">
                    <button
                      type="button"
                      onClick={toggleFollow}
                      disabled={!!followPending[selected.id]}
                      style={{
                        background: isFollowing ? "rgba(255,255,255,.14)" : "var(--color-brand-gold)",
                        color: isFollowing ? "#fff" : "var(--color-brand-ink)",
                      }}
                      className="cursor-pointer whitespace-nowrap rounded-full px-[26px] py-2.5 text-center text-[13.5px] font-bold transition-colors disabled:cursor-default disabled:opacity-70"
                    >
                      {isFollowing ? "Đang theo dõi" : "Theo dõi"}
                    </button>
                    <Link
                      href={viewerId ? `/ca-nhan?chat=${selected.id}` : "/dang-nhap"}
                      className="whitespace-nowrap rounded-full border border-white/28 px-[22px] py-2.5 text-center text-[13.5px] font-semibold text-white no-underline"
                    >
                      Nhắn tin
                    </Link>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 border-b border-[#f1efec]">
                {SECTION_KEYS.map((key, i) => (
                  <div
                    key={key}
                    style={{ borderRight: i < SECTION_KEYS.length - 1 ? "1px solid #f1efec" : "none" }}
                    className="px-5 py-4"
                  >
                    <div className="text-[22px] font-extrabold text-brand-ink">{selected.works[key].length}</div>
                    <div className="mt-0.5 text-[12.5px] text-stone">{SECTION_META[key].label}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] pt-[18px]">
                <div className="truncate text-xs font-bold tracking-[1.1px] text-stone">
                  TÁC PHẨM CỦA {selected.nickname.toUpperCase()}
                </div>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="shrink-0 cursor-pointer whitespace-nowrap text-[13px] font-semibold text-brand-ink"
                >
                  {openCount === SECTION_KEYS.length ? "Thu gọn tất cả" : "Mở rộng tất cả"}
                </button>
              </div>

              <div className="flex flex-col gap-3 px-[22px] pb-[26px] pt-1.5">
                {SECTION_KEYS.map((key) => {
                  const meta = SECTION_META[key];
                  const Icon = SECTION_ICONS[key];
                  const its = selected.works[key];
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
                          {its.map((it) => {
                            const row = (
                              <div className="flex items-center gap-3.5 border-t border-[#f4f2ef] px-[18px] py-3.5 transition-colors hover:bg-cream-card">
                                {it.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={it.imageUrl}
                                    alt={it.title}
                                    className="h-11 w-11 shrink-0 rounded-[9px] object-cover"
                                  />
                                ) : (
                                  <div
                                    style={{ background: meta.bg, color: meta.color }}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px]"
                                  >
                                    <Icon size={18} />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[14.5px] font-semibold text-ink">{it.title}</div>
                                  <div className="mt-[3px] text-[12.5px] text-stone">{it.meta}</div>
                                </div>
                                <div className="shrink-0 text-[12.5px] font-medium text-stone-light">{it.date}</div>
                              </div>
                            );
                            return it.href ? (
                              <Link key={it.id} href={it.href} className="block no-underline">
                                {row}
                              </Link>
                            ) : (
                              <div key={it.id}>{row}</div>
                            );
                          })}
                          {its.length === 0 && (
                            <div className="border-t border-[#f4f2ef] px-[18px] py-5 text-[13px] text-stone-light">
                              Chưa có tác phẩm nào trong mục này.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
