'use client';
import { useEffect, useRef, useState } from 'react';
import type { EventGameProps } from './registry';

type Bootstrap = { gameUrl: string; gameOrigin: string; ticket: string; expiresAt: number; nonce: string; protocol: 1 };

export default function KyNhanHoi(props: EventGameProps) {
  const [attempt, setAttempt] = useState(0);
  return <GameFrame key={`${props.eventId}:${attempt}`} {...props} onRetry={() => setAttempt(value => value + 1)} />;
}

function GameFrame({ eventId, active = true, onClose, onRetry, onCatalogChange }: EventGameProps & { onRetry: () => void }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const visibility = useRef(active);
  const notifyVisibility = useRef<(() => void) | null>(null);
  useEffect(() => { visibility.current = active; notifyVisibility.current?.(); }, [active]);
  const close = useRef(onClose);
  const catalog = useRef(onCatalogChange);
  useEffect(() => { catalog.current = onCatalogChange; }, [onCatalogChange]);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const [gameUrl, setGameUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('Đang chuẩn bị Kỳ Nhân Hội…');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let bootstrap: Bootstrap | null = null, sent = false, sending = false, authenticated = false;
    let gameWindow: Window | null = null;
    type Direction = 'landscape' | 'portrait' | 'any';
    const orientation = screen.orientation as ScreenOrientation & { lock?: (direction: Direction) => Promise<void> };
    let direction: Direction = 'any', orientationPending = false;
    const wantedDirection = (): Direction => visibility.current && !abort.signal.aborted && !document.hidden
      && matchMedia('(pointer: coarse)').matches ? direction : 'any';
    const updateOrientation = () => {
      const wanted = wantedDirection();
      if (wanted === 'any') { try { orientation?.unlock?.(); } catch {} return; }
      if (orientationPending || !orientation?.lock) return;
      orientationPending = true;
      void orientation.lock(wanted).catch(() => {}).finally(() => {
        orientationPending = false;
        if (wantedDirection() !== wanted) updateOrientation();
      });
    };
    document.addEventListener('fullscreenchange', updateOrientation);
    document.addEventListener('visibilitychange', updateOrientation);
    let nonce = crypto.randomUUID();
    const fail = (message: string) => { if (!abort.signal.aborted) { clearTimeout(timer); setFailed(true); setStatus(message); } };
    const requestTicket = async () => {
      const res = await fetch('/api/events/knh/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, nonce }), signal: abort.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không mở được Kỳ Nhân Hội.');
      return data as Bootstrap;
    };
    const receive = async (event: MessageEvent) => {
      if (!bootstrap || event.source !== iframe.current?.contentWindow || event.origin !== bootstrap.gameOrigin || !event.data || event.data.protocol !== 1) return;
      if (event.data.type === 'vinh:knh:ready' && !sending) {
        sending = true;
        try {
          // Refresh a ticket if downloading the independently hosted game took too long.
          if (sent) { nonce = crypto.randomUUID(); authenticated = false; }
          if (sent || bootstrap.expiresAt < Date.now() + 10_000) bootstrap = await requestTicket();
          if (abort.signal.aborted) return;
          gameWindow = iframe.current?.contentWindow ?? null;
          gameWindow?.postMessage({ type: 'vinh:knh:init', protocol: 1, ticket: bootstrap.ticket, nonce }, bootstrap.gameOrigin);
          sent = true; setStatus('Đang xác thực phiên chơi…');
        } catch (e) { fail(e instanceof Error ? e.message : 'Không cấp được vé chơi.'); }
        finally { sending = false; }
      } else if (sent && event.data.nonce === nonce) {
        if (event.data.type === 'vinh:knh:view' && authenticated && typeof event.data.catalog === 'boolean') {
          catalog.current?.(event.data.catalog);
        }
        else if (event.data.type === 'vinh:knh:authenticated') { authenticated = true; notifyVisibility.current?.(); clearTimeout(timer); setStatus(''); }
        else if (event.data.type === 'vinh:knh:orientation' && authenticated && ['landscape', 'portrait', 'any'].includes(event.data.orientation)) {
          direction = event.data.orientation; updateOrientation();
        }
        else if (event.data.type === 'vinh:knh:close' && authenticated) close.current();
        else if (event.data.type === 'vinh:knh:error') fail('Dịch vụ game chưa xác thực được phiên chơi. Vui lòng thử lại.');
      }
    };
    notifyVisibility.current = () => {
      updateOrientation();
      if (bootstrap && authenticated) gameWindow?.postMessage({ type: 'vinh:knh:visibility', protocol: 1, nonce, visible: visibility.current }, bootstrap.gameOrigin);
    };
    window.addEventListener('message', receive);
    const timer = setTimeout(() => fail('Dịch vụ game chưa phản hồi. Vui lòng thử lại.'), 45_000);
    requestTicket().then(data => { if (!abort.signal.aborted) { bootstrap = data; setGameUrl(data.gameUrl); setStatus('Đang tải Kỳ Nhân Hội…'); } }).catch(e => fail(e instanceof Error ? e.message : 'Không mở được Kỳ Nhân Hội.'));
    return () => {
      if (bootstrap && authenticated) gameWindow?.postMessage({ type: 'vinh:knh:dispose', protocol: 1, nonce }, bootstrap.gameOrigin);
      notifyVisibility.current = null;
      abort.abort(); clearTimeout(timer); window.removeEventListener('message', receive);
      updateOrientation();
      document.removeEventListener('fullscreenchange', updateOrientation);
      document.removeEventListener('visibilitychange', updateOrientation);
    };
  }, [eventId]);
  return <div className="relative h-full min-h-[320px] bg-[#142d29]">
    {gameUrl && !failed && <iframe key={eventId} ref={iframe} src={gameUrl} title="Kỳ Nhân Hội" className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-orientation-lock" allow="autoplay; fullscreen" referrerPolicy="no-referrer" />}
    {status && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#142d29] p-6 text-center text-white" role="status" aria-live="polite"><p>{status}</p>{failed && <button type="button" className="rounded-xl bg-amber-200 px-5 py-3 font-semibold text-stone-900" onClick={onRetry}>Thử lại</button>}</div>}
  </div>;
}
