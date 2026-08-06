import type { Metadata } from "next";
import { Lora } from "next/font/google";
import { NowPlaying } from "@/components/audio/now-playing";
import { ChapterQueue } from "@/components/audio/chapter-queue";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Chương 14 · Vũng Vịnh Cuối Trời — Vịnh Audio",
};

export default function AudioPlayerPage() {
  return (
    <div
      className={`${lora.variable} grid flex-1 grid-cols-[1fr_360px] bg-brand-ink-dark`}
    >
      <NowPlaying />
      <ChapterQueue />
    </div>
  );
}
