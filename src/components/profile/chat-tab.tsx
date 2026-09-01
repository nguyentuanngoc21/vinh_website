"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MagnifyingGlassIcon,
  CaretLeftIcon,
  PaperPlaneRightIcon,
  UserCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AVATAR_TONES } from "@/lib/profile";
import { Field, Button, Alert } from "@/components/ui";
import { OrderCard, type OrderRow } from "@/components/profile/order-card";

type Conversation = {
  userId: string;
  nickname: string;
  username: string;
  avatarUrl: string | null;
  lastMessage: { body: string; createdAt: string; mine: boolean };
  unreadCount: number;
};

type ThreadMessage = { id: string; body: string; createdAt: string; mine: boolean; flagged?: boolean };

type Counterparty = { userId: string; nickname: string; username: string; avatarUrl: string | null };

type ChatTabProps = {
  activeUserId: string | null;
  onSelectUser: (userId: string) => void;
  mobileView: "list" | "thread";
  onBack: () => void;
};

// Hội thoại refetch mỗi 15s, luồng đang mở refetch mỗi 5s — không có
// realtime (websocket/Supabase Realtime) trong repo này, polling nhẹ là
// đủ cho quy mô hiện tại. Cả 2 chỉ chạy khi ChatTab đang mounted (tức tab
// "Hội thoại" đang mở), tự dừng khi rời tab.
const CONVERSATIONS_POLL_MS = 15_000;
const THREAD_POLL_MS = 5_000;

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function toneFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function Avatar({
  userId,
  nickname,
  avatarUrl,
  size,
}: {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  size: number;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={nickname}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ background: toneFor(userId), width: size, height: size, fontSize: size * 0.36 }}
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
    >
      {nickname[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export function ChatTab({ activeUserId, onSelectUser, mobileView, onBack }: ChatTabProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [listQuery, setListQuery] = useState("");

  const [counterparty, setCounterparty] = useState<Counterparty | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  // Đơn hàng gắn với cặp (mình, counterparty) — không có bảng conversations
  // riêng, xem ghi chú ở src/app/api/orders/route.ts (GET). Chỉ hiện đơn
  // gần nhất chưa 'cancelled' (đơn cũ đã hủy không còn cần thao tác gì).
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const autoSelectedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = () =>
    fetch("/api/messages")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setConversations(data.conversations ?? []);
        setConversationsLoaded(true);
      });

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, CONVERSATIONS_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  // Chưa chọn ai (vào thẳng tab, không qua ?chat=) nhưng đã có hội thoại
  // — tự chọn hội thoại gần nhất, khớp hành vi cũ (activeConv mặc định 0).
  useEffect(() => {
    if (activeUserId || autoSelectedRef.current || !conversationsLoaded) return;
    if (conversations.length > 0) {
      autoSelectedRef.current = true;
      onSelectUser(conversations[0].userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationsLoaded, conversations]);

  useEffect(() => {
    // Không chọn ai — không cần dọn counterparty/messages cũ: JSX bên
    // dưới đã ẩn hẳn khối thread khi !activeUserId (điều kiện
    // `!activeUserId || !counterparty`), state cũ nằm im vô hại tới lần
    // chọn tiếp theo mới bị ghi đè.
    if (!activeUserId) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/messages/${activeUserId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setCounterparty(data.counterparty);
          setMessages(data.messages ?? []);
          // Đã đọc — cập nhật lại badge chưa đọc ở danh sách hội thoại
          // ngay, không chờ tới lần poll tiếp theo.
          setConversations((prev) =>
            prev.map((c) => (c.userId === activeUserId ? { ...c, unreadCount: 0 } : c))
          );
        });
    load();
    const interval = setInterval(load, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeUserId]);

  useEffect(() => {
    if (!activeUserId) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/orders?withUserId=${activeUserId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setOrders(data.orders ?? []);
        });
    load();
    const interval = setInterval(load, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Suy ra "đã tải xong luồng đang chọn" từ chính counterparty thay vì
  // giữ 1 state threadLoaded riêng — counterparty chỉ khớp activeUserId
  // SAU KHI fetch (data.counterparty) đã trả về, nên đủ để phân biệt
  // "đang chờ" (counterparty vẫn của người trước hoặc null) với "đã có
  // dữ liệu của đúng người đang chọn".
  const threadReady = counterparty?.userId === activeUserId;

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending || !activeUserId) return;
    setSending(true);
    setSendError(null);
    const res = await fetch(`/api/messages/${activeUserId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    const data = await res.json().catch(() => null);
    setSending(false);
    if (!res.ok) {
      setSendError((data && data.error) || "Gửi tin nhắn thất bại.");
      return;
    }
    setMessages((prev) => [...prev, data.message]);
    setDraft("");
    // Đẩy hội thoại này lên đầu danh sách + cập nhật tin gần nhất, không
    // chờ vòng poll 15s tiếp theo mới thấy tin mình vừa gửi.
    setConversations((prev) => {
      const withoutThis = prev.filter((c) => c.userId !== activeUserId);
      const existing = prev.find((c) => c.userId === activeUserId);
      const entry: Conversation = existing ?? {
        userId: activeUserId,
        nickname: counterparty?.nickname ?? "",
        username: counterparty?.username ?? "",
        avatarUrl: counterparty?.avatarUrl ?? null,
        lastMessage: data.message,
        unreadCount: 0,
      };
      return [{ ...entry, lastMessage: data.message, unreadCount: 0 }, ...withoutThis];
    });
  };

  const filteredConversations = conversations.filter((c) => {
    const q = listQuery.trim().toLowerCase();
    return !q || c.nickname.toLowerCase().includes(q) || c.username.toLowerCase().includes(q);
  });

  return (
    <div className="px-0 pb-6 pt-[22px] sm:px-8 sm:pb-[60px] lg:px-11">
      <div className="grid h-[604px] grid-cols-[320px_1fr_272px] overflow-hidden border border-cream bg-white max-[1080px]:grid-cols-[288px_1fr] max-[759px]:h-[calc(100vh-260px)] max-[759px]:min-h-[420px] max-[759px]:grid-cols-1 sm:rounded-[18px]">
        {/* Conversation list */}
        <div
          className={`flex min-w-0 flex-col border-r border-[#f0f0ef] ${
            mobileView === "thread" ? "max-[759px]:hidden" : ""
          }`}
        >
          <div className="border-b border-[#f5f4f2] p-4 pb-3">
            <div className="mb-3 text-[17px] font-bold text-brand-ink">Hội thoại</div>
            <div className="rounded-full bg-neutral-bg px-3.5 py-2.5">
              <Field
                label={null}
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Tìm cuộc trò chuyện"
                className="border-none bg-transparent px-0 py-0 text-[13.5px] text-ink placeholder:text-[#9a9a9a] focus:border-transparent"
                suffix={<MagnifyingGlassIcon size={16} className="text-[#9a9a9a]" />}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversationsLoaded && filteredConversations.length === 0 && (
              <div className="px-4 py-6 text-center text-[13px] text-stone-light">
                {conversations.length === 0
                  ? "Chưa có hội thoại nào — bấm \"Nhắn tin\" trên trang Kết nối để bắt đầu."
                  : "Không tìm thấy hội thoại phù hợp."}
              </div>
            )}
            {filteredConversations.map((c) => {
              const on = c.userId === activeUserId;
              return (
                <button
                  key={c.userId}
                  type="button"
                  onClick={() => onSelectUser(c.userId)}
                  style={{
                    background: on ? "var(--color-cream-card)" : "transparent",
                    borderLeftColor: on ? "var(--color-brand-gold)" : "transparent",
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 border-l-[3px] px-4 py-3 text-left transition-colors hover:bg-cream-card"
                >
                  <Avatar userId={c.userId} nickname={c.nickname} avatarUrl={c.avatarUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        style={{ fontWeight: c.unreadCount > 0 ? 700 : 600 }}
                        className="truncate text-sm text-ink"
                      >
                        {c.nickname}
                      </div>
                      <div className="shrink-0 text-[11.5px] text-[#a8a29e]">
                        {timeLabel(c.lastMessage.createdAt)}
                      </div>
                    </div>
                    <div
                      style={{
                        color: c.unreadCount > 0 ? "var(--color-ink)" : "var(--color-stone)",
                        fontWeight: c.unreadCount > 0 ? 600 : 400,
                      }}
                      className="mt-0.5 truncate text-[12.5px]"
                    >
                      {c.lastMessage.mine ? "Bạn: " : ""}
                      {c.lastMessage.body}
                    </div>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-gold px-1.5 text-[11px] font-bold text-brand-ink">
                      {c.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread */}
        <div
          className={`flex min-w-0 flex-col bg-[#fdfdfc] ${
            mobileView === "list" ? "max-[759px]:hidden" : ""
          }`}
        >
          {!activeUserId || !threadReady || !counterparty ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-[13.5px] text-stone-light">
              {activeUserId ? "Đang tải…" : "Chọn một hội thoại để bắt đầu nhắn tin."}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-[#f0f0ef] bg-white px-[18px] py-3.5">
                <button
                  type="button"
                  onClick={onBack}
                  className="hidden h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full text-brand-ink max-[759px]:flex"
                >
                  <CaretLeftIcon size={19} />
                </button>
                <Avatar
                  userId={counterparty.userId}
                  nickname={counterparty.nickname}
                  avatarUrl={counterparty.avatarUrl}
                  size={38}
                />
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-ink">{counterparty.nickname}</div>
                  <div className="mt-0.5 text-xs text-stone">@{counterparty.username}</div>
                </div>
              </div>
              {orders
                .filter((o) => o.status !== "cancelled")
                .slice(0, 1)
                .map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    viewerId={o.buyer_id === counterparty.userId ? o.seller_id : o.buyer_id}
                    onChanged={(updated) => setOrders((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
                  />
                ))}
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-[18px] py-5">
                {messages.map((m) => (
                  <div key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
                    <div
                      style={{
                        background: m.mine ? "var(--color-brand-ink)" : "#f2f1ee",
                        color: m.mine ? "#fff" : "var(--color-ink)",
                        borderRadius: m.mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      }}
                      className="max-w-[74%] whitespace-pre-wrap break-words px-[15px] py-2.5 text-sm leading-[1.55]"
                    >
                      {m.body}
                    </div>
                    {m.mine && m.flagged && (
                      <div
                        title="Tin nhắn có thể chứa thông tin liên hệ/giao dịch ngoài nền tảng — chỉ mình bạn thấy cảnh báo này."
                        className="mt-1 flex items-center gap-1 text-[10.5px] text-[#A9781A]"
                      >
                        <WarningCircleIcon weight="fill" size={11} /> Có thể chứa thông tin ngoài nền tảng
                      </div>
                    )}
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="py-6 text-center text-[13px] text-stone-light">
                    Chưa có tin nhắn nào — gửi lời chào đầu tiên nhé.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              {sendError && (
                <div className="px-[18px] pb-2">
                  <Alert tone="error">{sendError}</Alert>
                </div>
              )}
              <div className="flex items-center gap-2.5 border-t border-[#f0f0ef] bg-white px-4 py-3">
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
                  className="min-w-0 flex-1 rounded-full border-none bg-neutral-bg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-brand-gold"
                />
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  className="h-[38px] w-[38px] rounded-full p-0 text-brand-ink"
                >
                  <PaperPlaneRightIcon weight="fill" size={17} />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Side panel */}
        {counterparty && (
          <div className="hidden flex-col gap-4 overflow-y-auto border-l border-[#f0f0ef] px-[18px] py-5 min-[1081px]:flex">
            <div className="flex flex-col items-center gap-2.5 text-center">
              <Avatar
                userId={counterparty.userId}
                nickname={counterparty.nickname}
                avatarUrl={counterparty.avatarUrl}
                size={68}
              />
              <div className="text-[15.5px] font-semibold text-ink">{counterparty.nickname}</div>
              <Link
                href={`/ket-noi?p=${counterparty.userId}`}
                className="flex items-center gap-2 rounded-full bg-brand-ink px-[18px] py-2 text-[13px] font-semibold text-white no-underline"
              >
                <UserCircleIcon size={16} color="var(--color-brand-gold-light)" /> Xem Profile
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
