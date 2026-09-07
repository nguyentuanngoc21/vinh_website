"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellIcon } from "@phosphor-icons/react/dist/ssr";

type Notification = {
  id: string;
  type: string;
  title: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

// Cùng nhịp poll nhẹ như chat-tab.tsx (không có realtime trong repo) —
// chuông chỉ cần đúng số chưa đọc, không cần tức thời như đang mở 1
// luồng chat.
const POLL_MS = 30_000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

/**
 * Chuông thông báo ở header, giữa nút hành động (Viết truyện/...) và
 * avatar (xem auth-cluster.tsx) — chỉ hiện khi đã đăng nhập. "Mục Thông
 * báo" hoàn toàn mới, chưa từng tồn tại trước — lớp (A) trong đặc tả gỡ
 * chương (title ngắn, bấm vào điều hướng qua `link`, thường trỏ tới Hội
 * thoại nơi có nội dung đầy đủ ở lớp B).
 */
export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = () =>
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      });

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) {
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      }).then(() => {
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      });
    }
  };

  const handleClickNotification = (n: Notification) => {
    setOpen(false);
    if (n.read_at === null) {
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {});
    }
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Thông báo"
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[#3a3a3a] transition-colors hover:text-brand-gold-dark"
      >
        <BellIcon size={21} />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B02A37] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[46px] z-[60] w-[320px] overflow-hidden rounded-2xl border border-cream bg-white shadow-[0_14px_34px_rgba(0,0,0,.16)]">
          <div className="border-b border-[#f1efec] px-[18px] py-3">
            <div className="text-[14.5px] font-semibold text-ink">Thông báo</div>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 && (
              <div className="px-[18px] py-8 text-center text-[13px] text-stone-light">
                Chưa có thông báo nào.
              </div>
            )}
            {notifications.map((n) => (
              <Link
                key={n.id}
                href={n.link ?? "#"}
                onClick={() => handleClickNotification(n)}
                className="flex flex-col gap-1 border-b border-[#f5f4f2] px-[18px] py-3 no-underline transition-colors last:border-b-0 hover:bg-cream-card"
              >
                <div
                  style={{ fontWeight: n.read_at === null ? 700 : 500 }}
                  className="text-[13.5px] leading-[1.45] text-ink"
                >
                  {n.title}
                </div>
                <div className="text-[11.5px] text-stone-light">{timeAgo(n.created_at)}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
