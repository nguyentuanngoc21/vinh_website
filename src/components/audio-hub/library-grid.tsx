"use client";

import { useState } from "react";
import Link from "next/link";
import { SortAscendingIcon, PlayCircleIcon, HeadphonesIcon, ListNumbersIcon } from "@phosphor-icons/react/dist/ssr";
import { GENRES, CATALOG } from "@/lib/audio-catalog";

export function LibraryGrid() {
  const [genre, setGenre] = useState("Tất cả");
  const items = CATALOG.filter((a) => genre === "Tất cả" || a.genre === genre);

  return (
    <section className="px-11 pb-2 pt-[34px]">
      <div className="mb-[18px] flex items-center justify-between">
        <h2 className="text-[21px] font-bold text-brand-ink">Kho truyện audio</h2>
        <div className="flex items-center gap-2.5 text-[13.5px] font-medium text-stone">
          <SortAscendingIcon /> Sắp xếp: mới nhất
        </div>
      </div>

      <div className="mb-[22px] flex flex-wrap gap-2.5">
        {GENRES.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setGenre(label)}
            className={`cursor-pointer rounded-full px-[18px] py-2.5 text-sm font-medium transition-colors ${
              label === genre
                ? "bg-brand-ink text-white"
                : "bg-neutral-bg text-[#3a3a3a]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-[22px] sm:grid-cols-3 lg:grid-cols-4">
        {items.map((a) => (
          <Link key={a.title} href="/audio/now-playing" className="group block no-underline">
            <div
              style={{ background: a.gradient }}
              className="relative h-[210px] overflow-hidden rounded-2xl shadow-[0_10px_22px_rgba(0,0,0,.16)]"
            >
              <div className="absolute left-2.5 top-2.5 rounded-full bg-brand-ink-dark/60 px-2.5 py-1 text-[10px] font-semibold tracking-[.5px] text-white">
                {a.genre}
              </div>
              <div className="absolute bottom-2.5 right-2.5 rounded-md bg-brand-ink-dark/70 px-[9px] py-1 text-[11px] font-medium text-white">
                {a.dur}
              </div>
              <div className="absolute inset-0 flex scale-90 items-center justify-center bg-brand-ink-dark/35 opacity-0 transition-[opacity,transform] duration-200 group-hover:scale-100 group-hover:opacity-100">
                <PlayCircleIcon weight="fill" size={54} color="#fff" />
              </div>
            </div>
            <div className="mt-[11px] text-[15px] font-semibold text-ink">
              {a.title}
            </div>
            <div className="mt-[3px] text-[13px] text-stone">
              Giọng đọc {a.narrator}
            </div>
            <div className="mt-[7px] flex items-center gap-3 text-[12.5px] font-medium text-stone-light">
              <span className="flex items-center gap-1">
                <HeadphonesIcon /> {a.plays}
              </span>
              <span className="flex items-center gap-1">
                <ListNumbersIcon /> {a.chaps} chương
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
