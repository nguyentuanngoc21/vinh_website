'use client';
import { useEffect, useRef, useState } from 'react';
import type { EventGameProps } from './registry';

type Bootstrap = { gameUrl: string; gameOrigin: string; ticket: string; expiresAt: number; nonce: string; protocol: 1 };

export default function DinoRun({ eventId, onClose }: EventGameProps) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [attempt, setAttempt] = useState(0);
  const [gameUrl, setGameUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('Đang chuẩn bị Dino Run…');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let bootstrap: Bootstrap | null = null, sent = false, sending = false, authenticated = false;
    let gameWindow: Window | null = null;
    const nonce = crypto.randomUUID();
    let timer: ReturnType<typeof setTimeout>;
    setGameUrl(null); setFailed(false); setStatus('Đang chuẩn bị Dino Run…');
    const fail = (message: string) => { if (!abort.signal.aborted) { clearTimeout(timer); setFailed(true); setStatus(message); } };
    const requestTicket = async () => {
      const res = await fetch('/api/events/dino/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, nonce }), signal: abort.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không mở được Dino Run.');
      return data as Bootstrap;
    };
    const receive = async (event: MessageEvent) => {
      if (!bootstrap || event.source !== iframe.current?.contentWindow || event.origin !== bootstrap.gameOrigin || !event.data || event.data.protocol !== 1) return;
      if (event.data.type === 'vinh:dino:ready' && !sent && !sending) {
        sending = true;
        try {
          // Refresh a ticket if downloading the independently hosted game took too long.
          if (bootstrap.expiresAt < Date.now() + 10_000) bootstrap = await requestTicket();
          if (abort.signal.aborted) return;
          gameWindow = iframe.current?.contentWindow ?? null;
          gameWindow?.postMessage({ type: 'vinh:dino:init', protocol: 1, ticket: bootstrap.ticket, nonce }, bootstrap.gameOrigin);
          sent = true; setStatus('Đang xác thực phiên chơi…');
        } catch (e) { fail(e instanceof Error ? e.message : 'Không cấp được vé chơi.'); }
        finally { sending = false; }
      } else if (sent && event.data.nonce === nonce) {
        if (event.data.type === 'vinh:dino:authenticated') { authenticated = true; clearTimeout(timer); setStatus(''); }
        else if (event.data.type === 'vinh:dino:close' && authenticated) close.current();
        else if (event.data.type === 'vinh:dino:error') fail('Dịch vụ game chưa xác thực được phiên chơi. Vui lòng thử lại.');
      }
    };
    window.addEventListener('message', receive);
    timer = setTimeout(() => fail('Dịch vụ game chưa phản hồi. Vui lòng thử lại.'), 45_000);
    requestTicket().then(data => { if (!abort.signal.aborted) { bootstrap = data; setGameUrl(data.gameUrl); setStatus('Đang tải Dino Run…'); } }).catch(e => fail(e instanceof Error ? e.message : 'Không mở được Dino Run.'));
    return () => {
      if (bootstrap && authenticated) gameWindow?.postMessage({ type: 'vinh:dino:dispose', protocol: 1, nonce }, bootstrap.gameOrigin);
      abort.abort(); clearTimeout(timer); window.removeEventListener('message', receive);
    };
  }, [eventId, attempt]);
  return <div className="relative h-full min-h-[320px] bg-[#142d29]">
    {gameUrl && !failed && <iframe key={`${eventId}:${attempt}`} ref={iframe} src={gameUrl} title="Dino Run" className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen" referrerPolicy="no-referrer" />}
    {status && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#142d29] p-6 text-center text-white" role="status" aria-live="polite"><p>{status}</p>{failed && <button type="button" className="rounded-xl bg-amber-200 px-5 py-3 font-semibold text-stone-900" onClick={() => setAttempt(value => value + 1)}>Thử lại</button>}</div>}
  </div>;
}
