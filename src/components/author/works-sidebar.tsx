"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowSquareOutIcon, PlusIcon, GearIcon, UploadSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { useRole } from "@/lib/role";
import { BookCover } from "@/components/covers/book-cover";
import { ImportManuscriptModal } from "@/components/author/import-manuscript-modal";
import { VinhMark } from "@/components/ui";
import type { BookGenre } from "@/lib/supabase/types";

export type SidebarBook = {
  id: string;
  title: string;
  genre: BookGenre | null;
  slug: string;
  // true = sách đã có ít nhất 1 chương từng được xuất bản (xem
  // src/app/api/authoring/chapters/[chapterId]/route.ts) — /truyen/[slug]
  // chỉ 404 nếu false, dùng để quyết định có hiện link "Xem trang truyện" không.
  published: boolean;
  meta: string;
};

export function WorksSidebar({ books }: { books: SidebarBook[] }) {
  const pathname = usePathname();
  // /author/[bookId]/... → phần tử thứ 3 sau khi split("/").
  const activeBookId = pathname?.split("/")[2];
  const { session } = useRole();
  const [showImport, setShowImport] = useState(false);

  return (
    <aside className="flex flex-col overflow-hidden bg-brand-ink-dark text-sidebar-text">
      <div className="flex items-center gap-[9px] border-b border-white/8 px-5 py-[18px]">
        <Link href="/" className="flex flex-1 items-center gap-[9px] no-underline">
          <VinhMark size={30} tone="cream" />
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
          const content = (
            <>
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
            </>
          );

          return (
            // Không lồng <Link> "Xem trang truyện" vào trong <Link> mở
            // editor (2 <a> lồng nhau là HTML không hợp lệ) — tách 2 link
            // làm anh em cùng cấp trong 1 wrapper, thay vì 1 link bọc hết.
            <div
              key={book.id}
              className={`flex items-center gap-1 rounded-[9px] transition-colors ${
                active ? "bg-brand-gold-light/14" : "hover:bg-info-bg/10"
              }`}
            >
              <Link
                href={`/author/${book.id}`}
                className="flex min-w-0 flex-1 items-center gap-[11px] p-3 no-underline"
              >
                {content}
              </Link>
              {book.published && (
                <Link
                  href={`/truyen/${book.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Xem trang truyện (tab mới)"
                  className={`mr-2 shrink-0 rounded-md p-1.5 transition-colors hover:bg-white/10 ${
                    active ? "text-white" : "text-[#6f8794]"
                  }`}
                >
                  <ArrowSquareOutIcon size={15} />
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <Link
        href="/author/new"
        className="mx-4 mt-3.5 block cursor-pointer rounded-[9px] border border-dashed border-white/22 p-[11px] text-center text-[13px] font-semibold text-sidebar-text-dim no-underline"
      >
        <PlusIcon className="inline" /> Tác phẩm mới
      </Link>

      <button
        type="button"
        onClick={() => setShowImport(true)}
        className="mx-4 mt-2 cursor-pointer rounded-[9px] border border-dashed border-white/22 p-[11px] text-center text-[13px] font-semibold text-sidebar-text-dim"
      >
        <UploadSimpleIcon className="inline" /> Nhập bản thảo
      </button>

      <ImportManuscriptModal
        open={showImport}
        onClose={() => setShowImport(false)}
        books={books.map((b) => ({ id: b.id, title: b.title }))}
      />

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
    </aside>
  );
}
