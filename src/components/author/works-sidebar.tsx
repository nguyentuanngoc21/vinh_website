"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusIcon, GearIcon } from "@phosphor-icons/react/dist/ssr";
import { useRole } from "@/lib/role";
import { BookCover } from "@/components/covers/book-cover";
import { CreateWorkModal } from "@/components/author/create-work-modal";
import type { BookGenre } from "@/lib/supabase/types";

export type SidebarBook = {
  id: string;
  title: string;
  genre: BookGenre | null;
  meta: string;
  // null chỉ xảy ra nếu 1 sách bị xoá hết chương bằng tay ngoài luồng tạo
  // sách bình thường (create luôn kèm "Chương 1") — phòng hộ, không click
  // được tới đâu trong trường hợp hiếm này.
  latestChapterId: string | null;
};

export function WorksSidebar({ books }: { books: SidebarBook[] }) {
  const pathname = usePathname();
  // /author/[bookId]/[chapterId] → phần tử thứ 3 sau khi split("/").
  const activeBookId = pathname?.split("/")[2];
  const [createOpen, setCreateOpen] = useState(false);
  const { session } = useRole();

  return (
    <aside className="flex flex-col overflow-hidden bg-brand-ink-dark text-sidebar-text">
      <div className="flex items-center gap-[9px] border-b border-white/8 px-5 py-[18px]">
        <Link href="/" className="flex flex-1 items-center gap-[9px] no-underline">
          <svg width="30" height="30" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" fill="var(--color-brand-ink)" />
            <path
              d="M50,98 A48,48 0 0 1 50,2 A24,24 0 0 1 50,50 A24,24 0 0 0 50,98 Z"
              fill="var(--color-cream-card-alt)"
            />
            <circle cx="44" cy="24" r="3" fill="var(--color-brand-ink)" />
          </svg>
          <span className="text-[19px] font-extrabold text-white">Vịnh</span>
        </Link>
        <span className="ml-auto rounded-[5px] border border-brand-gold-light/40 px-[7px] py-0.5 text-[11px] font-medium text-brand-gold-light">
          Tác giả
        </span>
      </div>

      <div className="px-3.5 pb-2 pt-4 text-[11px] font-bold tracking-wide text-[#6f8794]">
        TÁC PHẨM CỦA TÔI
      </div>
      <div className="flex flex-col gap-0.5 px-2.5">
        {books.length === 0 && (
          <div className="px-3 py-2 text-xs leading-relaxed text-[#6f8794]">
            Chưa có tác phẩm nào — bấm &quot;Tác phẩm mới&quot; bên dưới để bắt đầu.
          </div>
        )}
        {books.map((book) => {
          const active = book.id === activeBookId;
          const row = (
            <div
              className={`flex items-center gap-[11px] rounded-[9px] p-3 transition-colors ${
                active ? "bg-brand-gold-light/14" : "cursor-pointer hover:bg-info-bg/10"
              }`}
            >
              <div className="h-[46px] w-[34px] shrink-0 overflow-hidden rounded-[5px]">
                <BookCover id={book.id} title={book.title} genre={book.genre} />
              </div>
              <div className="min-w-0">
                <div
                  className={`overflow-hidden truncate text-sm font-semibold ${
                    active ? "text-white" : "text-[#dbe4e8]"
                  }`}
                >
                  {book.title}
                </div>
                <div className={`text-xs ${active ? "text-sidebar-text-dim" : "text-[#6f8794]"}`}>
                  {book.meta}
                </div>
              </div>
            </div>
          );

          return book.latestChapterId ? (
            <Link
              key={book.id}
              href={`/author/${book.id}/${book.latestChapterId}`}
              className="no-underline"
            >
              {row}
            </Link>
          ) : (
            <div key={book.id}>{row}</div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="mx-4 mt-3.5 cursor-pointer rounded-[9px] border border-dashed border-white/22 p-[11px] text-center text-[13px] font-semibold text-sidebar-text-dim"
      >
        <PlusIcon className="inline" /> Tác phẩm mới
      </button>

      <div className="mt-auto flex items-center gap-2.5 border-t border-white/8 px-[18px] py-4">
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#c8a86a] text-sm font-bold text-white">
          {session?.name?.[0] ?? "?"}
        </div>
        <div className="min-w-0">
          <div className="overflow-hidden truncate text-[13px] font-semibold text-white">
            {session?.name ?? ""}
          </div>
          <div className="overflow-hidden truncate text-[11px] text-[#6f8794]">
            @{session?.handle ?? ""}
          </div>
        </div>
        <Link
          href="/ca-nhan"
          title="Cài đặt tài khoản"
          className="ml-auto shrink-0 rounded-md p-1 text-inherit no-underline transition-colors hover:bg-info-bg/10"
        >
          <GearIcon size={18} />
        </Link>
      </div>

      <CreateWorkModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </aside>
  );
}
