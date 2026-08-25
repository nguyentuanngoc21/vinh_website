"use client";

import { useState } from "react";
import { Pill } from "@/components/ui";

const MAX_TAGS = 20; // khớp CHECK books_tags_length_check (migrations/20260824_add_book_tags_and_view_count.sql)

type TagInputProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
};

/**
 * Input thêm tag tự do — KHÁC GenreSelect (1 giá trị, danh sách cố định
 * 8 thể loại): đây là nhiều giá trị, tác giả tự đặt chữ, không có danh
 * sách gợi ý dùng chung.
 */
export function TagInput({ tags, onChange }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const value = draft.trim();
    setDraft("");
    if (!value || tags.length >= MAX_TAGS || tags.includes(value)) return;
    onChange([...tags, value]);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Pill key={tag} onRemove={() => onChange(tags.filter((t) => t !== tag))}>
            {tag}
          </Pill>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        disabled={tags.length >= MAX_TAGS}
        placeholder={tags.length >= MAX_TAGS ? `Tối đa ${MAX_TAGS} tag` : "Thêm tag, Enter để xác nhận"}
        className="w-full rounded-lg border border-cream-border bg-white px-3 py-2.5 text-[13px] outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
