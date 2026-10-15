"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRightIcon, GameControllerIcon, XIcon, TicketIcon } from "@phosphor-icons/react/dist/ssr";
import { eventPrice, type VinhEvent, type EventGame } from "@/lib/events/catalog";
import { EVENT_GAME_COMPONENTS } from "./games/registry";

export function EventSidebar({ event }: { event: VinhEvent }) {
  const [selected, setSelected] = useState<EventGame | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!selected) return;
    const element = dialog.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [selected]);
  const Game = selected ? EVENT_GAME_COMPONENTS[selected.id] : undefined;
  return (
    <>
      <aside aria-label="Vé và trò chơi của sự kiện" className="self-start rounded-[22px] border border-line bg-surface p-6 shadow-sm lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.15em] text-stone"><TicketIcon size={18} /> Vé tham dự</div>
        <p className="mb-2 mt-4 text-2xl font-extrabold text-brand-ink">{eventPrice(event)}</p>
        <p className="text-xs leading-relaxed text-stone">{event.priceVnd === 0 ? "Cùng gặp gỡ và trải nghiệm với cộng đồng." : "Thông tin vé được cung cấp bởi người tổ chức."}</p>
        {event.ticketUrl && <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer" className="mt-5 flex items-center justify-center gap-2 rounded-full bg-brand-gold px-5 py-3.5 text-sm font-bold text-brand-navy no-underline">{event.priceVnd === 0 ? "Đăng ký tham dự" : "Xem vé / đăng ký"}<ArrowUpRightIcon size={18} /></a>}
        <div className="mt-7 border-t border-line pt-6"><h2 className="flex items-center gap-2 text-lg font-bold text-brand-ink"><GameControllerIcon size={23} /> Chơi cùng Vịnh</h2><p className="mt-2 text-xs leading-relaxed text-stone">Trò chơi dành riêng cho cuộc hẹn này.</p>
          {event.games.length ? <div className="mt-4 space-y-3">{event.games.map((game) => <button key={game.id} type="button" onClick={() => setSelected(game)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-muted p-4 text-left transition-colors hover:border-brand-gold"><span><span className="block text-sm font-bold text-brand-ink">{game.title}</span><span className="mt-1 block text-xs text-stone">{game.description}</span></span><ArrowUpRightIcon size={18} className="shrink-0 text-brand-gold-dark" /></button>)}</div> : <div className="mt-4 rounded-xl bg-surface-muted px-4 py-5 text-sm leading-relaxed text-stone">Sự kiện này chưa có trò chơi.</div>}
        </div>
      </aside>
      <dialog ref={dialog} aria-labelledby="event-game-title" onCancel={(e) => { e.preventDefault(); setSelected(null); }} onClick={(e) => { if (e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) setSelected(null); } }} className="m-auto h-[80dvh] max-h-none w-[80vw] max-w-none overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-md">
        <div className="flex h-full flex-col"><div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-6"><h2 id="event-game-title" className="text-base font-bold text-brand-ink">{selected?.title ?? "Trò chơi sự kiện"}</h2><button type="button" aria-label="Đóng trò chơi" onClick={() => setSelected(null)} className="rounded-full p-2 hover:bg-surface-muted"><XIcon size={22} /></button></div><div className="min-h-0 flex-1 overflow-auto">{selected && Game ? <Game eventId={event.slug} onClose={() => setSelected(null)} /> : <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><GameControllerIcon size={40} className="text-brand-gold-dark" /><h3 className="text-xl font-bold">Trò chơi chưa mở</h3><p className="max-w-md text-sm text-stone">Vịnh sẽ cập nhật trò chơi tại đây khi sẵn sàng.</p></div>}</div></div>
      </dialog>
    </>
  );
}
