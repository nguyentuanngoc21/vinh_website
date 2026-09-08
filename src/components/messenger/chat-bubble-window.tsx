"use client";

import { useEffect, useRef, useState } from "react";
import { MinusIcon, XIcon, PaperPlaneRightIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { UserAvatar } from "@/components/user-avatar";
import { Field, Button } from "@/components/ui";
import { useChatBubbles, type BubbleWindow } from "@/lib/chat-bubbles";
import type { MessageContext } from "@/lib/use-conversations";
import { chatThreadHref } from "@/lib/chat-thread-href";
import { OrderSummaryChip, type OrderSummary } from "@/components/messenger/order-summary-chip";

type ThreadMessage = { id: string; body: string; createdAt: string; mine: boolean; flagged?: boolean };
type OrderRow = {
  id: string;
  code: string;
  status: string;
  price: number;
  paid: number;
  service_listings: { name: string } | null;
};

// Cùng nhịp THREAD_POLL_MS với luồng đang mở ở chat-tab.tsx.
const THREAD_POLL_MS = 5_000;

/**
 * Panel bong bóng chat đang "expanded" — bản thu gọn của phần Thread ở
 * chat-tab.tsx (không có side panel, không gian hẹp hơn nhiều; đơn dịch vụ
 * hiện qua OrderSummaryChip CHỈ ĐỌC thay vì OrderCard đầy đủ hành động, xem
 * order-summary-chip.tsx). Tự poll luồng tin nhắn + đơn hàng riêng của nó
 * (độc lập với danh sách hội thoại ở useChatBubbles()/useConversations —
 * đó chỉ để hiện preview/badge, không chứa nội dung đầy đủ từng tin).
 */
export function ChatBubbleWindow({
  conv,
  onThreadRead,
}: {
  conv: BubbleWindow;
  onThreadRead: (userId: string, context: MessageContext) => void;
}) {
  const { minimize, close } = useChatBubbles();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // onThreadRead đổi identity mỗi render ở chat-bubble-dock.tsx (đóng qua
  // markThreadRead của useConversations) — giữ qua ref để effect dưới chỉ
  // phụ thuộc (userId, context), không lập lại vòng poll mỗi lần cha
  // render lại.
  const onThreadReadRef = useRef(onThreadRead);
  useEffect(() => {
    onThreadReadRef.current = onThreadRead;
  });

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/messages/${conv.userId}?context=${conv.context}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setMessages(data.messages ?? []);
          // GET đã tự đánh dấu đã đọc ở server (side effect) — zero badge
          // ngay ở danh sách chia sẻ (MessengerBell/dock), không chờ poll.
          onThreadReadRef.current(conv.userId, conv.context);
        });
    load();
    const interval = setInterval(load, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conv.userId, conv.context]);

  // Đơn dịch vụ gắn với đúng cặp (mình, đối tác) — chỉ hiện thẻ tóm tắt
  // CHỈ ĐỌC (order-summary-chip.tsx), không có OrderCard đầy đủ (xem ghi
  // chú ở đó). Component này chỉ mount khi bong bóng đang "expanded"
  // (chat-bubble-dock.tsx chỉ render ChatBubbleWindow cho đúng 1 cửa sổ
  // đang mở) — nên tự nhiên đã thoả "chỉ poll /api/orders khi đang mở",
  // không cần điều kiện riêng: bong bóng bị minimize sẽ unmount hẳn
  // component này, vòng poll dưới đây tự dừng theo.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/orders?withUserId=${conv.userId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          const open = (data.orders ?? []).find((o: OrderRow) => o.status !== "cancelled");
          setOrder(
            open
              ? {
                  id: open.id,
                  code: open.code,
                  status: open.status,
                  price: open.price,
                  paid: open.paid,
                  serviceName: open.service_listings?.name ?? null,
                }
              : null
          );
        });
    load();
    const interval = setInterval(load, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conv.userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    const res = await fetch(`/api/messages/${conv.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, context: conv.context }),
    });
    const data = await res.json().catch(() => null);
    setSending(false);
    if (!res.ok) {
      setSendError((data && data.error) || "Gửi tin nhắn thất bại.");
      return;
    }
    setMessages((prev) => [...prev, data.message]);
    setDraft("");
  };

  return (
    <div className="flex h-[420px] w-[300px] flex-col overflow-hidden rounded-t-2xl border border-cream bg-white shadow-[0_14px_34px_rgba(0,0,0,.2)]">
      <div className="flex items-center gap-2.5 bg-brand-ink px-3.5 py-2.5">
        <UserAvatar userId={conv.userId} nickname={conv.nickname} avatarUrl={conv.avatarUrl} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[13px] font-semibold text-white">{conv.nickname}</div>
            {conv.isModerationThread && (
              <span className="shrink-0 rounded-full bg-brand-gold px-1.5 py-0.5 text-[9px] font-semibold text-brand-ink">
                Kiểm duyệt
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => minimize(conv.userId, conv.context)}
          aria-label="Thu nhỏ"
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-brand-gold-light transition-colors hover:bg-white/10"
        >
          <MinusIcon size={13} weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => close(conv.userId, conv.context)}
          aria-label="Đóng"
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-brand-gold-light transition-colors hover:bg-white/10"
        >
          <XIcon size={13} weight="bold" />
        </button>
      </div>
      {order && <OrderSummaryChip order={order} threadHref={chatThreadHref(conv.userId, conv.context)} />}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[#fdfdfc] px-3 py-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
            <div
              style={{
                background: m.mine ? "var(--color-brand-ink)" : "#f2f1ee",
                color: m.mine ? "#fff" : "var(--color-ink)",
                borderRadius: m.mine ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
              }}
              className="max-w-[85%] whitespace-pre-wrap break-words px-3 py-2 text-[12.5px] leading-[1.5]"
            >
              {m.body}
            </div>
            {m.mine && m.flagged && (
              <div
                title="Tin nhắn có thể chứa thông tin liên hệ/giao dịch ngoài nền tảng — chỉ mình bạn thấy cảnh báo này."
                className="mt-1 flex items-center gap-1 text-[9.5px] text-[#A9781A]"
              >
                <WarningCircleIcon weight="fill" size={10} /> Có thể chứa thông tin ngoài nền tảng
              </div>
            )}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="py-6 text-center text-[12px] text-stone-light">Chưa có tin nhắn nào.</div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {sendError && <div className="px-3 pb-1.5 text-[11px] text-[#B02A37]">{sendError}</div>}
      <div className="flex items-center gap-2 border-t border-[#f0f0ef] bg-white px-2.5 py-2">
        <Field
          label={null}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Nhắn tin…"
          className="min-w-0 flex-1 rounded-full border-none bg-neutral-bg px-3.5 py-2 text-[12.5px] outline-none focus:ring-1 focus:ring-brand-gold"
        />
        <Button
          type="button"
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          className="h-8 w-8 shrink-0 rounded-full p-0 text-brand-ink"
        >
          <PaperPlaneRightIcon weight="fill" size={14} />
        </Button>
      </div>
    </div>
  );
}
