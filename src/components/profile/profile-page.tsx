"use client";

import { useEffect, useState } from "react";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { FollowingTab } from "@/components/profile/following-tab";
import { ChatTab } from "@/components/profile/chat-tab";
import { EditProfileTab } from "@/components/profile/edit-profile-tab";
import { DailyTasksTab } from "@/components/profile/daily-tasks-tab";
import { CONVERSATIONS, type ProfileTab } from "@/lib/profile";

export function ProfilePage() {
  const [tab, setTab] = useState<ProfileTab>("edit");
  const [activeConv, setActiveConv] = useState(0);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [mute, setMute] = useState(false);

  // Header hiển thị trên MỌI tab (không chỉ tab "edit"), nên fetch riêng
  // ở đây thay vì đọc state của EditProfileTab — 2 nơi cùng gọi
  // GET /api/profile/me độc lập là chấp nhận được, cùng pattern
  // BankInfoForm/IdentityForm đã dùng (mỗi widget tự fetch dữ liệu của
  // mình, không có tầng cache chung).
  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [joinedYear, setJoinedYear] = useState("");
  const [tokenBalance, setTokenBalance] = useState("…");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/profile/me").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/wallet/balance").then((res) => (res.ok ? res.json() : null)),
    ]).then(([me, balance]) => {
      if (cancelled) return;
      if (me) {
        setNickname(me.nickname ?? "");
        setUsername(me.username ?? "");
        if (me.createdAt) setJoinedYear(String(new Date(me.createdAt).getFullYear()));
      }
      if (balance) setTokenBalance(Number(balance.available ?? 0).toLocaleString("vi-VN"));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Jumping here from the Following tab's "Nhắn tin" button both switches
  // tab and focuses the matching conversation (mirrors the mockup's
  // Math.min clamp so an index past the sample thread list still resolves).
  const openChatWith = (personIndex: number) => {
    setActiveConv(Math.min(personIndex, CONVERSATIONS.length - 1));
    setMobileView("thread");
    setTab("chat");
  };

  return (
    <>
      <ProfileHeader
        nickname={nickname}
        username={username}
        joinedYear={joinedYear}
        tokenBalance={tokenBalance}
      />
      <ProfileTabs active={tab} onChange={setTab} />

      {tab === "following" && <FollowingTab onMessage={openChatWith} />}

      {tab === "chat" && (
        <ChatTab
          activeConv={activeConv}
          onSelectConv={(i) => {
            setActiveConv(i);
            setMobileView("thread");
          }}
          mobileView={mobileView}
          onBack={() => setMobileView("list")}
          mute={mute}
          onToggleMute={() => setMute((v) => !v)}
        />
      )}

      {tab === "edit" && <EditProfileTab onNicknameSaved={setNickname} />}

      {tab === "tasks" && <DailyTasksTab />}
    </>
  );
}
