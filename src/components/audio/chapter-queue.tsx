"use client";

import { useState } from "react";
import { SpeakerHighIcon, LockSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui";

type Chapter = { num: string; title: string; dur: string; current?: boolean; locked?: boolean };

const INITIAL_CHAPTERS: Chapter[] = [
  { num: "12", title: "Sóng ngầm", dur: "17:42" },
  { num: "13", title: "Người trở về", dur: "21:05" },
  { num: "14", title: "Đêm không trăng", dur: "19:30", current: true },
  { num: "15", title: "Lời của biển", dur: "18:14" },
  { num: "16", title: "Mùa gió chướng", dur: "22:48" },
  { num: "17", title: "Vết muối", dur: "16:33", locked: true },
  { num: "18", title: "Hải đăng cuối", dur: "20:11", locked: true },
  { num: "19", title: "Tên trong sóng", dur: "19:02", locked: true },
];

export function ChapterQueue() {
  const [chapters, setChapters] = useState<Chapter[]>(INITIAL_CHAPTERS);

  const lockedCount = chapters.filter((ch) => ch.locked).length;

  function unlockChapter(chapterNum: string) {
    setChapters((prev) =>
      prev.map((ch) =>
        ch.num === chapterNum
          ? { ...ch, locked: false }
          : ch
      )
    );
  }

  function unlockAll() {
    setChapters((prev) => prev.map((ch) => ({ ...ch, locked: false })));
  }

  return (
    <div className="flex flex-col overflow-hidden bg-[#FBF8F1]">
      <div className="border-b border-cream-border px-6 pb-3.5 pt-[22px]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-brand-ink">Danh sách chương</div>
            <div className="mt-[3px] text-[13px] text-stone-alt">
              36 chương · 11 giờ 24 phút
            </div>
          </div>
          {lockedCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              className="w-auto rounded-full border border-cream-border bg-transparent px-4 py-2 text-sm font-semibold text-brand-ink"
              onClick={unlockAll}
            >
              Mở khóa trọn bộ
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {chapters.map((ch) => (
          <div
            key={ch.num}
            style={{ background: ch.current ? "#F7EFD8" : "transparent" }}
            className="flex cursor-pointer items-center gap-[13px] rounded-[10px] p-3 transition-colors hover:bg-info-bg"
          >
            <div className="w-[30px] shrink-0 text-center">
              {ch.current ? (
                <SpeakerHighIcon weight="fill" size={18} color="var(--color-brand-gold-dark)" />
              ) : (
                <span className="text-sm font-semibold text-[#b3a994]">{ch.num}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-sm font-semibold"
                style={{
                  color: ch.current
                    ? "var(--color-brand-ink)"
                    : ch.locked
                      ? "var(--color-stone-alt)"
                      : "#3a352e",
                }}
              >
                {ch.title}
              </div>
              <div className="text-xs text-stone-alt">{ch.dur}</div>
            </div>
            <div className="flex items-center gap-2">
              {ch.locked ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-auto rounded-full border border-cream-border bg-transparent px-3 py-2 text-xs font-semibold text-brand-ink"
                    onClick={(event) => {
                      event.stopPropagation();
                      unlockChapter(ch.num);
                    }}
                  >
                    Mở khóa
                  </Button>
                  <LockSimpleIcon size={15} color="#b3a994" />
                </>
              ) : ch.current ? (
                <SpeakerHighIcon weight="fill" size={18} color="var(--color-brand-gold-dark)" />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
