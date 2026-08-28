"use client";

import { useEffect, useMemo, useState } from "react";
import { ChatCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { AVATAR_TONES } from "@/lib/profile";
import { Field, Alert } from "@/components/ui";

type FollowedPerson = {
  userId: string;
  nickname: string;
  username: string;
  avatarUrl: string | null;
  // Đã suy sẵn ở server (union creator_tags tự khai báo + suy từ
  // sách/audio/thiết kế thật đã đăng — xem api/follows/route.ts, vì
  // creator_tags gần như luôn rỗng do chưa có UI nào set nó).
  tags: string[];
  followerCount: number;
};

function toneFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function metaFor(p: FollowedPerson): string {
  return `${p.tags.join(", ")} · ${p.followerCount.toLocaleString("vi-VN")} người theo dõi`;
}

type FollowingTabProps = { onMessage: (userId: string) => void };

export function FollowingTab({ onMessage }: FollowingTabProps) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<FollowedPerson[] | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/follows")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setPeople(data.people ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people ?? []).filter(
      (p) => !q || p.nickname.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)
    );
  }, [people, query]);

  const handleUnfollow = async (userId: string) => {
    if (pending[userId]) return;
    setPending((prev) => ({ ...prev, [userId]: true }));
    try {
      const res = await fetch(`/api/authors/${userId}/follow`, { method: "POST" });
      const data = await res.json().catch(() => null);
      // Tab này chỉ hiện người ĐANG theo dõi — toggle trả về false (bỏ
      // theo dõi thành công) thì gỡ khỏi danh sách; true thì thôi (đã lỡ
      // bấm 2 lần/race), không cần xử lý gì thêm.
      if (res.ok && data && data.following === false) {
        setPeople((prev) => (prev ?? []).filter((p) => p.userId !== userId));
      }
    } finally {
      setPending((prev) => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold tracking-[1.4px] text-brand-gold-dark">
          ĐANG THEO DÕI · {(people ?? []).length.toLocaleString("vi-VN")} NGƯỜI
        </div>
        <div className="w-full rounded-full bg-neutral-bg px-4 py-2.5 sm:w-[250px]">
          <Field
            label={null}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lọc theo tên…"
            className="border-none bg-transparent px-0 py-0 text-[13.5px] text-ink placeholder:text-[#9a9a9a] focus:border-transparent"
          />
        </div>
      </div>

      {people === null ? (
        <div className="py-10 text-center text-[13.5px] text-stone-light">Đang tải…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <div
                key={p.userId}
                className="flex items-center gap-3.5 rounded-2xl border border-cream px-[18px] py-4"
              >
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatarUrl}
                    alt={p.nickname}
                    className="h-[46px] w-[46px] shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    style={{ background: toneFor(p.userId) }}
                    className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                  >
                    {p.nickname[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-ink">{p.nickname}</div>
                  <div className="mt-0.5 truncate text-[12.5px] text-stone">{metaFor(p)}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => onMessage(p.userId)}
                    title="Nhắn tin"
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-cream text-brand-ink transition-transform hover:-translate-y-0.5"
                  >
                    <ChatCircleIcon size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnfollow(p.userId)}
                    disabled={!!pending[p.userId]}
                    className="cursor-pointer whitespace-nowrap rounded-full border border-brand-gold bg-brand-gold px-4 py-2 text-[12.5px] font-semibold text-brand-ink transition-transform hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-60"
                  >
                    Đang theo dõi
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="py-10">
              <Alert tone="info">
                {(people ?? []).length === 0
                  ? "Bạn chưa theo dõi ai — ghé trang Kết nối để tìm người phù hợp."
                  : "Không tìm thấy người phù hợp."}
              </Alert>
            </div>
          )}
        </>
      )}
    </div>
  );
}
