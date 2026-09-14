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
import { timeLabel, messageTimeLabel, isNewSession, sessionDividerLabel } from "@/lib/format-time";
import { autoGrowTextarea, resetTextareaHeight } from "@/lib/autogrow-textarea";
import { Field, Alert, Skeleton } from "@/components/ui";
import { OrderCard, type OrderRow } from "@/components/profile/order-card";

type MessageContext = "personal" | "moderation";

type Conversation = {
  userId: string;
  context: MessageContext;
  nickname: string;
  username: string;
  avatarUrl: string | null;
  // Hòm thư "moderation" (tin gỡ chương) — TÁCH theo TIN NHẮN (context),
  // không phải theo tài khoản: cùng 1 admin có thể vừa có hòm thư này
  // vừa có hòm thư "personal" riêng nếu họ cũng tự chat bình thường với
  // cùng tác giả. Chỉ dùng để gắn 1 nhãn nhỏ cạnh tên — danh tính (tên/
  // avatar) LUÔN hiển thị thật, không che giấu. Xem
  // migrations/20260908_add_direct_message_context.sql.
  isModerationThread: boolean;
  lastMessage: { body: string; createdAt: string; mine: boolean };
  unreadCount: number;
};

type ThreadMessage = { id: string; body: string; createdAt: string; mine: boolean; flagged?: boolean };

type Counterparty = {
  userId: string;
  nickname: string;
  username: string;
  avatarUrl: string | null;
  isModerationThread: boolean;
};

type ChatTabProps = {
  activeUserId: string | null;
  activeContext: MessageContext;
  onSelectUser: (userId: string, context: MessageContext) => void;
  mobileView: "list" | "thread";
  onBack: () => void;
};

// Hội thoại refetch mỗi 15s, luồng đang mở refetch mỗi 5s — không có
// realtime (websocket/Supabase Realtime) trong repo này, polling nhẹ là
// đủ cho quy mô hiện tại. Cả 2 chỉ chạy khi ChatTab đang mounted (tức tab
// "Hội thoại" đang mở), tự dừng khi rời tab.
const CONVERSATIONS_POLL_MS = 15_000;
const THREAD_POLL_MS = 5_000;
// Ô soạn tin tự giãn tối đa tới đây rồi tự cuộn bên trong (autoGrowTextarea)
// — không cho giãn vô hạn, tin rất dài sẽ đẩy hết khung tin nhắn phía trên
// ra khỏi tầm nhìn.
const COMPOSER_MAX_HEIGHT_PX = 140;

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

export function ChatTab({ activeUserId, activeContext, onSelectUser, mobileView, onBack }: ChatTabProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [listQuery, setListQuery] = useState("");

  const [counterparty, setCounterparty] = useState<(Counterparty & { context: MessageContext }) | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  // Đơn hàng gắn với cặp (mình, counterparty) — không có bảng conversations
  // riêng, xem ghi chú ở src/app/api/orders/route.ts (GET). Chỉ hiện đơn
  // gần nhất chưa 'cancelled' (đơn cũ đã hủy không còn cần thao tác gì).
  // Hòm thư moderation (admin gỡ chương) thường không có đơn hàng nào
  // giữa 2 bên — /api/orders tự trả rỗng, không cần điều kiện riêng.
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const autoSelectedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

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
      onSelectUser(conversations[0].userId, conversations[0].context);
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
      fetch(`/api/messages/${activeUserId}?context=${activeContext}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setCounterparty({ ...data.counterparty, context: data.context });
          setMessages(data.messages ?? []);
          // Đã đọc — cập nhật lại badge chưa đọc ở danh sách hội thoại
          // ngay, không chờ tới lần poll tiếp theo. Chỉ đúng dòng (cùng
          // userId VÀ context) — hòm thư còn lại (nếu có) giữ nguyên.
          setConversations((prev) =>
            prev.map((c) =>
              c.userId === activeUserId && c.context === activeContext ? { ...c, unreadCount: 0 } : c
            )
          );
        });
    load();
    const interval = setInterval(load, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeUserId, activeContext]);

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
  // giữ 1 state threadLoaded riêng — counterparty chỉ khớp
  // (activeUserId, activeContext) SAU KHI fetch đã trả về.
  const threadReady = counterparty?.userId === activeUserId && counterparty?.context === activeContext;

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending || !activeUserId) return;
    setSending(true);
    setSendError(null);
    const res = await fetch(`/api/messages/${activeUserId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Gửi kèm context đang mở — để reply trong hòm thư moderation nằm
      // ĐÚNG hòm thư đó (route server tự hạ về "personal" nếu không đúng
      // điều kiện, xem api/messages/[userId]/route.ts).
      body: JSON.stringify({ body: text, context: activeContext }),
    });
    const data = await res.json().catch(() => null);
    setSending(false);
    if (!res.ok) {
      setSendError((data && data.error) || "Gửi tin nhắn thất bại.");
      return;
    }
    setMessages((prev) => [...prev, data.message]);
    setDraft("");
    resetTextareaHeight(composerRef.current);
    // Đẩy hội thoại này lên đầu danh sách + cập nhật tin gần nhất, không
    // chờ vòng poll 15s tiếp theo mới thấy tin mình vừa gửi.
    setConversations((prev) => {
      const withoutThis = prev.filter((c) => !(c.userId === activeUserId && c.context === activeContext));
      const existing = prev.find((c) => c.userId === activeUserId && c.context === activeContext);
      const entry: Conversation = existing ?? {
        userId: activeUserId,
        context: activeContext,
        nickname: counterparty?.nickname ?? "",
        username: counterparty?.username ?? "",
        avatarUrl: counterparty?.avatarUrl ?? null,
        isModerationThread: counterparty?.isModerationThread ?? false,
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
      {/* max-[759px]:h-auto + overflow-visible — bản cũ dùng
          h-[calc(100vh-260px)] + overflow-hidden, nhưng 260px không tính
          SiteHeader (sticky top-0 TOÀN site + 1 hàng danh mục cuộn ngang
          bên dưới nó, xem site-header.tsx) — trên mobile phần "phía
          trên" thực tế cao hơn 260px, khiến khung này bị tính THẤP hơn
          không gian còn lại thật, và overflow-hidden cắt đứt phần dư
          (đúng vị trí ô nhập tin nhắn) không cách nào cuộn tới. Bỏ hẳn
          việc đoán 1 con số cố định trên mobile — để trang cuộn tự
          nhiên, ô nhập tin nhắn tự "dính" đáy màn hình bằng sticky (xem
          composer bên dưới), không phụ thuộc chiều cao phần tử phía
          trên nữa.

          min-[760px]:sticky — bug thật đã xảy ra ở desktop: cột trái
          (danh sách hội thoại) và cột phải (side panel) có nội dung NGẮN,
          nằm sát đỉnh khung 604px; cột giữa (tin nhắn) tự cuộn xuống tin
          mới nhất. Nếu người dùng cuộn TRANG (không phải cuộn trong
          khung) để thấy hết tin nhắn, cả khung 604px di chuyển theo —
          phần ĐỈNH của khung (chứa toàn bộ nội dung cột trái/phải) bị đẩy
          lên trên, khuất khỏi khung nhìn, chỉ còn thấy phần ĐÁY (đúng lúc
          đó cột trái/phải đã hết nội dung từ lâu) — trông như "bị trắng"
          dù dữ liệu vẫn đúng, không mất gì. sticky ghim khung lại 1 lần
          khi cuộn tới, luôn thấy trọn 604px (đủ cả đỉnh lẫn đáy) thay vì
          dừng lại giữa chừng. top-[124px] ước lượng đúng bằng chiều cao
          SiteHeader (2 hàng: logo/avatar + danh mục, ~110–125px) để
          không bị đè lên nhau — cần chỉnh lại nếu SiteHeader đổi chiều
          cao sau này. */}
      <div
        className={`grid h-[604px] overflow-hidden border border-cream bg-white max-[1080px]:grid-cols-[288px_1fr] max-[759px]:h-auto max-[759px]:overflow-visible max-[759px]:grid-cols-1 min-[760px]:sticky min-[760px]:top-[124px] sm:rounded-[18px] ${
          counterparty ? "grid-cols-[320px_1fr_272px]" : "grid-cols-[320px_1fr]"
        }`}
      >
        {/* Conversation list */}
        {/* min-h-0 — bắt buộc: đây là 1 grid item, mặc định co giãn theo
            content (min-height: auto) thay vì bám đúng chiều cao 604px của
            hàng grid, khiến overflow-y-auto ở div con (danh sách hội
            thoại) không bao giờ thực sự có chỗ để cuộn — nội dung cứ đẩy
            cả cột cao dần, bị overflow-hidden ở ngoài cắt cụt trong im
            lặng thay vì cuộn được. Cùng lý do cho "Thread"/"Side panel"
            bên dưới. */}
        <div
          className={`flex min-h-0 min-w-0 flex-col border-r border-[#f0f0ef] ${
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
          <div className="min-h-0 flex-1 overflow-y-auto max-[759px]:overflow-visible">
            {conversationsLoaded && filteredConversations.length === 0 && (
              <div className="px-4 py-6 text-center text-[13px] text-stone-light">
                {conversations.length === 0
                  ? "Chưa có hội thoại nào — bấm \"Nhắn tin\" trên trang Kết nối để bắt đầu."
                  : "Không tìm thấy hội thoại phù hợp."}
              </div>
            )}
            {filteredConversations.map((c) => {
              const on = c.userId === activeUserId && c.context === activeContext;
              return (
                <button
                  key={`${c.userId}::${c.context}`}
                  type="button"
                  onClick={() => onSelectUser(c.userId, c.context)}
                  style={{
                    background: on ? "var(--color-cream-card)" : "transparent",
                    borderLeftColor: on ? "var(--color-brand-gold)" : "transparent",
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 border-l-[3px] px-4 py-3 text-left transition-colors hover:bg-cream-card"
                >
                  <Avatar userId={c.userId} nickname={c.nickname} avatarUrl={c.avatarUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <div
                          style={{ fontWeight: c.unreadCount > 0 ? 700 : 600 }}
                          className="truncate text-sm text-ink"
                        >
                          {c.nickname}
                        </div>
                        {c.isModerationThread && (
                          <span className="shrink-0 rounded-full bg-brand-ink px-1.5 py-0.5 text-[9.5px] font-semibold text-brand-gold-light">
                            Kiểm duyệt
                          </span>
                        )}
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
          className={`flex min-h-0 min-w-0 flex-col bg-[#fdfdfc] ${
            mobileView === "list" ? "max-[759px]:hidden" : ""
          }`}
        >
          {!activeUserId ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-[13.5px] text-stone-light">
              Chọn một hội thoại để bắt đầu nhắn tin.
            </div>
          ) : !threadReady || !counterparty ? (
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-3 border-b border-[#f0f0ef] bg-white px-[18px] py-3.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-32 rounded-[var(--radius-sm)]" />
              </div>
              <div className="flex flex-1 flex-col justify-end gap-2.5 px-[18px] py-4">
                <Skeleton className="h-9 w-2/3 self-start rounded-2xl" />
                <Skeleton className="h-9 w-1/2 self-end rounded-2xl" />
                <Skeleton className="h-9 w-3/5 self-start rounded-2xl" />
              </div>
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
                  <div className="flex items-center gap-1.5">
                    <div className="text-[15px] font-semibold text-ink">{counterparty.nickname}</div>
                    {counterparty.isModerationThread && (
                      <span className="rounded-full bg-brand-ink px-2 py-0.5 text-[10px] font-semibold text-brand-gold-light">
                        Kiểm duyệt
                      </span>
                    )}
                  </div>
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
              <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-[18px] py-5 max-[759px]:overflow-visible">
                {messages.map((m, i) => (
                  <div key={m.id} className="flex flex-col">
                    {/* Dòng chia phiên (tham khảo Zalo) — cách tin liền
                        trước quá 15 phút hoặc khác ngày thì chèn 1 mốc
                        giờ căn giữa phía trên tin đầu tiên của phiên mới.
                        Xem src/lib/format-time.ts isNewSession()/
                        sessionDividerLabel(). */}
                    {isNewSession(i > 0 ? messages[i - 1].createdAt : null, m.createdAt) && (
                      <div className="my-2 text-center text-[11px] font-medium text-stone-light">
                        {sessionDividerLabel(m.createdAt)}
                      </div>
                    )}
                    <div className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
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
                      {/* Giờ:phút dưới MỖI bong bóng — luôn hiện, không
                          chỉ tin cuối 1 chuỗi (đã chốt theo yêu cầu, khác
                          hành vi mặc định của Zalo nhưng rõ ràng hơn). */}
                      <div className="mt-0.5 px-1 text-[10.5px] text-stone-light">{messageTimeLabel(m.createdAt)}</div>
                      {m.mine && m.flagged && (
                        <div
                          title="Tin nhắn có thể chứa thông tin liên hệ/giao dịch ngoài nền tảng — chỉ mình bạn thấy cảnh báo này."
                          className="mt-1 flex items-center gap-1 text-[10.5px] text-[#A9781A]"
                        >
                          <WarningCircleIcon weight="fill" size={11} /> Có thể chứa thông tin ngoài nền tảng
                        </div>
                      )}
                    </div>
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
              {/* sticky bottom-0 trên mobile — ô nhập KHÔNG còn phụ thuộc
                  vào chiều cao chính xác của mọi phần tử phía trên (xem
                  ghi chú ở container ngoài cùng); tự "dính" đáy màn hình
                  khi cuộn, đúng hành vi chat mobile chuẩn, bất kể
                  SiteHeader/ProfileHeader cao bao nhiêu. */}
              {/* KHÔNG dùng Field/Button dùng chung ở đây. 2 lỗi API từng
                  chặn việc này (Field không forward className lên <label>
                  bọc ngoài; Button có base class w-full luôn thắng class
                  ghi đè width) ĐÃ ĐƯỢC SỬA — xem `wrapperClassName` trong
                  field.tsx/textarea.tsx và prop `fullWidth` trong
                  button.tsx. Vẫn giữ phần tử thuần ở đây vì lý do khác: ô
                  nhập là pill bo tròn hết cỡ, không viền, nền
                  neutral-bg + auto-grow theo nội dung (autoGrowTextarea) —
                  khác hẳn hình dạng chuẩn của Field/Textarea (bo góc nhỏ,
                  có viền, nền trắng); nút gửi là nút tròn chỉ-icon 38×38 —
                  Button chưa có biến thể icon-only (chỉ có 3 biến thể
                  primary/dark/ghost dạng chữ). Ép cả hai vào Field/Button
                  sẽ phải ghi đè gần hết class nền tảng, rủi ro hơn lợi ích
                  thống nhất — giữ nguyên phần tử thuần, chỉ 2 lỗi trên
                  (đã sửa ở chỗ dùng chung) là lý do gốc bị chặn, không phải
                  hình dạng. textarea (thay vì input) + autoGrowTextarea còn
                  cho tự giãn dòng khi soạn tin dài — input cũ không làm
                  được vì input luôn 1 dòng bất kể CSS. items-end (thay vì
                  items-center) để nút gửi ghim đáy khi textarea cao lên. */}
              <div className="flex shrink-0 items-end gap-2.5 border-t border-[#f0f0ef] bg-white px-4 py-3 max-[759px]:sticky max-[759px]:bottom-0 max-[759px]:z-10">
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    autoGrowTextarea(e.target, COMPOSER_MAX_HEIGHT_PX);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Nhắn tin…"
                  rows={1}
                  className="min-h-[38px] max-h-[140px] min-w-0 flex-1 resize-none overflow-y-auto rounded-3xl border-none bg-neutral-bg px-4 py-2.5 text-sm leading-[1.4] outline-none focus:ring-1 focus:ring-brand-gold"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  aria-label="Gửi"
                  className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand-gold text-brand-ink transition-transform hover:brightness-[1.08] active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <PaperPlaneRightIcon weight="fill" size={17} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Side panel */}
        {counterparty && (
          <div className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-l border-[#f0f0ef] px-[18px] py-5 min-[1081px]:flex">
            <div className="flex flex-col items-center gap-2.5 text-center">
              <Avatar
                userId={counterparty.userId}
                nickname={counterparty.nickname}
                avatarUrl={counterparty.avatarUrl}
                size={68}
              />
              <div className="text-[15.5px] font-semibold text-ink">{counterparty.nickname}</div>
              {/* Danh tính luôn thật (kể cả hòm thư kiểm duyệt) — luôn có
                  profile thật để xem, không cần ẩn nút này nữa. */}
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
