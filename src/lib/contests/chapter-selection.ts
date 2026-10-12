import type { EligibilityCheck } from "@/lib/contests/eligibility/types";

export type ContestChapter = {
  id: string;
  book_id: string;
  title: string;
  order_index: number;
  created_at: string;
  published_at: string | null;
  published: boolean;
  removed_at: string | null;
  price: number;
  audio_price: number;
  word_count: number;
  eligible_for_contest?: boolean;
};

export function isChapterInContestWindow(chapter: ContestChapter, start: string, end: string): boolean {
  const from = Date.parse(start), until = Date.parse(end);
  const created = Date.parse(chapter.created_at), published = Date.parse(chapter.published_at ?? "");
  return chapter.published && chapter.removed_at === null &&
    created >= from && created < until && published >= from && published < until;
}

export function selectedChapterChecks(chapters: ContestChapter[], ids: string[], start: string, end: string): EligibilityCheck[] {
  const selected = chapters.filter((c) => ids.includes(c.id));
  const valid = ids.length > 0 && new Set(ids).size === ids.length && selected.length === ids.length &&
    selected.every((c) => isChapterInContestWindow(c, start, end));
  return [{
    code: "selected_chapters", passed: valid, blocking: true,
    message: valid ? `Đã chọn ${ids.length} chương được tạo và xuất bản trong thời gian nhận bài` :
      "Chọn ít nhất một chương được tạo và xuất bản trong thời gian mở nhận bài; chương phải còn hiển thị",
  }];
}
