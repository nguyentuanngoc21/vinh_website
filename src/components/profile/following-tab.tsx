"use client";

import { useMemo, useState } from "react";
import { ChatCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { FOLLOWED_PEOPLE, AVATAR_TONES } from "@/lib/profile";
import { Field, Alert } from "@/components/ui";

type FollowingTabProps = { onMessage: (personIndex: number) => void };

export function FollowingTab({ onMessage }: FollowingTabProps) {
  const [query, setQuery] = useState("");
  const [unfollowed, setUnfollowed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FOLLOWED_PEOPLE.map((p, index) => ({ ...p, index })).filter(
      (p) => !q || p.name.toLowerCase().includes(q)
    );
  }, [query]);

  const toggle = (name: string) => setUnfollowed((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold tracking-[1.4px] text-brand-gold-dark">
          ĐANG THEO DÕI · 128 NGƯỜI
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

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const off = !!unfollowed[p.name];
          return (
            <div
              key={p.name}
              className="flex items-center gap-3.5 rounded-2xl border border-cream px-[18px] py-4"
            >
              <div
                style={{ background: AVATAR_TONES[p.index % AVATAR_TONES.length] }}
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
              >
                {p.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-ink">{p.name}</div>
                <div className="mt-0.5 text-[12.5px] text-stone">{p.meta}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => onMessage(p.index)}
                  title="Nhắn tin"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-cream text-brand-ink transition-transform hover:-translate-y-0.5"
                >
                  <ChatCircleIcon size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => toggle(p.name)}
                  style={{
                    background: off ? "var(--color-brand-gold)" : "#fff",
                    color: off ? "var(--color-brand-ink)" : "var(--color-stone-dark)",
                    borderColor: off ? "var(--color-brand-gold)" : "var(--color-cream)",
                  }}
                  className="cursor-pointer whitespace-nowrap rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-transform hover:-translate-y-0.5"
                >
                  {off ? "Theo dõi" : "Đang theo dõi"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-10">
          <Alert tone="info">Không tìm thấy người phù hợp.</Alert>
        </div>
      )}
    </div>
  );
}
