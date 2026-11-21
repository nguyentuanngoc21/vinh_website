"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRightIcon, GameControllerIcon, ArrowsInIcon, TicketIcon } from "@phosphor-icons/react/dist/ssr";
import { eventPrice, type VinhEvent, type EventGame } from "@/lib/events/catalog";
import { EVENT_GAME_COMPONENTS } from "./games/registry";

export function EventSidebar({ event }: { event: VinhEvent }) {
  return <EventSidebarContent key={event.slug} event={event} />;
}

function EventSidebarContent({ event }: { event: VinhEvent }) {
  const [selected, setSelected] = useState<EventGame | null>(null);
  const [opened, setOpened] = useState<{ eventId: string; game: EventGame }[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const fullscreenShell = useRef<HTMLDivElement>(null);
  const trigger = useRef<Element | null>(null);
  useEffect(() => {
    let wasFullscreen = false;
    const onFullscreenChange = () => {
      if (document.fullscreenElement === fullscreenShell.current) wasFullscreen = true;
      else if (wasFullscreen && !document.fullscreenElement) {
        wasFullscreen = false;
        setSelected(null);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  function openGame(game: EventGame) {
    trigger.current = document.activeElement;
    setOpened(items => [...items.filter(item => item.eventId === event.slug && item.game.id !== game.id), { eventId: event.slug, game }]);
    setSelected(game);
    // Request during the click gesture; the viewport layout also covers browsers
    // that do not support or permit the Fullscreen API.
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    const screen = fullscreenShell.current;
    if (screen?.requestFullscreen && !document.fullscreenElement) {
      void screen.requestFullscreen().catch(() => {});
    }
  }
  useEffect(() => {
    if (!selected) return;
    const element = dialog.current;
    const screen = fullscreenShell.current;
    const previousTrigger = trigger.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (element && !element.open) element.showModal();
    return () => {
      if (document.fullscreenElement === screen) void document.exitFullscreen().catch(() => {});
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousTrigger instanceof HTMLElement && previousTrigger.isConnected) previousTrigger.focus();
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
          {event.games.length ? <div className="mt-4 space-y-3">{event.games.map((game) => <button key={game.id} type="button" onClick={() => openGame(game)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-muted p-4 text-left transition-colors hover:border-brand-gold"><span><span className="block text-sm font-bold text-brand-ink">{game.title}</span><span className="mt-1 block text-xs text-stone">{game.description}</span></span><ArrowUpRightIcon size={18} className="shrink-0 text-brand-gold-dark" /></button>)}</div> : <div className="mt-4 rounded-xl bg-surface-muted px-4 py-5 text-sm leading-relaxed text-stone">Sự kiện này chưa có trò chơi.</div>}
        </div>
      </aside>
      <dialog ref={dialog} aria-labelledby="event-game-title" onCancel={(e) => { e.preventDefault(); setSelected(null); }} onClick={(e) => { if (e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) setSelected(null); } }} style={{ width: "100vw", height: "100dvh", maxWidth: "none", maxHeight: "none", margin: 0, padding: 0, border: 0 }} className="fixed inset-0 overflow-hidden bg-[#142d29] text-ink backdrop:bg-black">
        <div ref={fullscreenShell} data-event-game-screen style={{ width: "100%", height: "100%", position: "relative" }} className="bg-[#142d29]">
        <h2 id="event-game-title" className="sr-only">{selected?.title ?? "Game"}</h2>
        <button type="button" aria-label="Thu nhỏ trò chơi về trang sự kiện" title="Thu nhỏ / Quay lại sự kiện" onClick={() => setSelected(null)} className="absolute left-[max(8px,env(safe-area-inset-left))] top-[max(8px,env(safe-area-inset-top))] z-50 flex min-h-11 items-center gap-2 rounded-lg border border-brand-gold bg-brand-navy px-3 py-2 text-sm font-bold text-white shadow-lg"><ArrowsInIcon size={20} /><span>Thu nhỏ</span></button>
        <div className="h-full overflow-hidden">{opened.filter(item => item.eventId === event.slug).map(({ game }) => { const CachedGame = EVENT_GAME_COMPONENTS[game.id]; return CachedGame ? <div key={`${event.slug}:${game.id}`} hidden={selected?.id !== game.id} className="h-full"><CachedGame eventId={event.slug} active={selected?.id === game.id} onClose={() => setSelected(null)} /></div> : null; })}{selected && !Game ? <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><GameControllerIcon size={40} className="text-brand-gold-dark" /><h3 className="text-xl font-bold">Trò chơi chưa mở</h3><p className="max-w-md text-sm text-stone">Vịnh sẽ cập nhật trò chơi tại đây khi sẵn sàng.</p></div> : null}</div>
        </div>
      </dialog>
    </>
  );
}
