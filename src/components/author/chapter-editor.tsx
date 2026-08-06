"use client";

import { useState } from "react";
import {
  CaretRightIcon,
  CloudCheckIcon,
  QuotesIcon,
  TextAlignLeftIcon,
  MinusIcon,
  ImageIcon,
  TextHTwoIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Field } from "@/components/ui";

const DRAFT_DEFAULT = `Gió từ vịnh thổi vào, mang theo mùi muối và một thứ im lặng rất cũ. Bà tôi nói biển nhớ tất cả những ai từng ra đi, và cất giữ tên họ dưới đáy nước sâu, nơi không ánh nắng nào với tới.

Đêm ấy không có trăng. Chỉ có ngọn hải đăng ở mũi đất phía tây, cứ mười hai giây lại quét một vòng sáng qua mặt nước đen, rồi tắt. Tôi đếm những lần ấy, như đếm nhịp thở của một người đang ngủ — đều đặn, kiên nhẫn, và buồn không nói thành lời.

Cha tôi ra khơi từ lúc tôi còn chưa biết nhớ mặt người. Mẹ giữ lại cho tôi một chiếc áo của ông, thứ vải đã bạc đi vì nắng và vì những lần giặt bằng nước biển.`;

const TOOLBAR_ICONS = [QuotesIcon, TextAlignLeftIcon, MinusIcon];

export function ChapterEditor() {
  const [draft, setDraft] = useState(DRAFT_DEFAULT);

  const words = (draft.trim().match(/\S+/g) ?? []).length;
  const wordCount = words.toLocaleString("vi-VN");
  const readMin = Math.max(1, Math.round(words / 200));

  return (
    <div className="flex flex-col overflow-hidden bg-[#FBF8F1]">
      <div className="flex items-center justify-between border-b border-cream-border bg-[#FBF8F1] px-7 py-3.5">
        <div className="flex items-center gap-2.5 text-[13px] font-medium text-stone-alt">
          <span>Vũng Vịnh Cuối Trời</span>
          <CaretRightIcon size={12} />
          <span className="font-semibold text-brand-ink">Chương 14</span>
        </div>
        <div className="flex items-center gap-3.5 text-[13px] font-medium text-stone-alt">
          <span className="flex items-center gap-1">
            <CloudCheckIcon color="#3B9B6F" /> Đã lưu tự động · 14:32
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-9">
        <div className="mx-auto max-w-[660px] px-7">
          <Field
            label={null}
            defaultValue="Đêm không trăng"
            className="mb-1.5 w-full resize-none border-none bg-transparent p-0 font-[family-name:var(--font-lora)] text-[32px] font-semibold text-brand-ink outline-none"
          />
          <div className="mb-[22px] flex items-center gap-3.5 text-[13px] text-stone-alt">
            <span>Chương 14</span>
            <span>·</span>
            <span>{wordCount} chữ</span>
            <span>·</span>
            <span>~{readMin} phút đọc</span>
          </div>

          <div className="sticky top-0 z-[5] mb-5 flex items-center gap-1 border-b border-cream-border bg-[#FBF8F1] py-2">
            <div className="cursor-pointer rounded-md px-2.5 py-1.5 font-[family-name:var(--font-lora)] text-[15px] font-bold transition-colors hover:bg-info-bg">
              B
            </div>
            <div className="cursor-pointer rounded-md px-2.5 py-1.5 font-[family-name:var(--font-lora)] text-[15px] font-medium italic transition-colors hover:bg-info-bg">
              I
            </div>
            <div className="cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg">
              <TextHTwoIcon size={17} />
            </div>
            <div className="mx-1.5 h-5 w-px bg-cream-border" />
            {TOOLBAR_ICONS.map((Icon, i) => (
              <div
                key={i}
                className="cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg"
              >
                <Icon size={17} />
              </div>
            ))}
            <div className="mx-1.5 h-5 w-px bg-cream-border" />
            <div className="cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg">
              <ImageIcon size={17} />
            </div>
          </div>

          <textarea
            className="min-h-[460px] w-full resize-none border-none bg-transparent font-[family-name:var(--font-lora)] text-lg leading-[1.95] text-[#2b2925] outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
