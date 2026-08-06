"use client";

import { useState } from "react";
import { CoinsIcon } from "@phosphor-icons/react/dist/ssr";
import { CopyrightSettings } from "@/components/author/copyright-settings";

export function PublishPanel() {
  const [publishMode, setPublishMode] = useState<"exclusive" | "nonExclusive">("exclusive");
  const [chapterPrice, setChapterPrice] = useState("0");

  return (
    <div className="flex flex-col overflow-y-auto border-l border-cream-border bg-white">
      <div className="flex gap-2.5 border-b border-cream-border px-[22px] py-5">
        <div className="flex-1 cursor-pointer rounded-[9px] border border-brand-ink py-[11px] text-center text-sm font-semibold text-brand-ink">
          Lưu nháp
        </div>
        <div className="flex-1 cursor-pointer rounded-[9px] bg-brand-gold py-[11px] text-center text-sm font-bold text-brand-ink">
          Xuất bản
        </div>
      </div>

      <div className="p-[22px]">
        <div className="mb-3.5 text-xs font-bold tracking-wide text-stone-alt">
          XUẤT BẢN
        </div>
        <div className="mb-6 flex flex-col gap-3.5">
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-[#5C5650]">
              Trạng thái
            </div>
            <div className="flex gap-2">
              <div className="flex-1 rounded-lg bg-info-bg py-2.5 text-center text-[13px] font-semibold text-[#2C5870]">
                Công khai
              </div>
              <div className="flex-1 rounded-lg border border-cream-border py-2.5 text-center text-[13px] font-semibold text-stone-alt">
                Hẹn giờ
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-[#5C5650]">
              Quyền độc quyền
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPublishMode("exclusive")}
                className={`flex-1 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  publishMode === "exclusive"
                    ? "bg-brand-ink text-white"
                    : "border border-cream-border bg-white text-stone-alt"
                }`}
              >
                Độc quyền
              </button>
              <button
                type="button"
                onClick={() => setPublishMode("nonExclusive")}
                className={`flex-1 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  publishMode === "nonExclusive"
                    ? "bg-brand-ink text-white"
                    : "border border-cream-border bg-white text-stone-alt"
                }`}
              >
                Không độc quyền
              </button>
            </div>
            <div className="mt-2 text-[12px] text-stone-alt">
              {publishMode === "exclusive"
                ? "Truyện này chỉ được phân phối trên Vịnh. Tác giả giữ quyền tái bản."
                : "Tác giả có thể xuất bản truyện này ở các nền tảng khác."
              }
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-[#5C5650]">
              Giá chương
            </div>
            <div className="flex items-center rounded-lg border border-cream-border px-3 py-2.5">
              <CoinsIcon color="var(--color-brand-gold)" />
              <input
                type="number"
                min="0"
                step="1000"
                value={chapterPrice}
                onChange={(event) => setChapterPrice(event.target.value)}
                className="ml-2 w-full bg-transparent text-sm font-semibold outline-none"
              />
              <span className="ml-2 text-sm text-stone-alt">token</span>
            </div>
          </div>
        </div>

        <CopyrightSettings />
      </div>
    </div>
  );
}
