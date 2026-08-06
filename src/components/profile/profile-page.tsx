"use client";

import { useState } from "react";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { FollowingTab } from "@/components/profile/following-tab";
import { ChatTab } from "@/components/profile/chat-tab";
import { EditProfileTab } from "@/components/profile/edit-profile-tab";
import { DailyTasksTab } from "@/components/profile/daily-tasks-tab";
import {
  CONVERSATIONS,
  DEFAULT_NICKNAME,
  DEFAULT_BIO,
  DEFAULT_TOKEN_BALANCE,
  type ProfileTab,
} from "@/lib/profile";

export function ProfilePage() {
  const [tab, setTab] = useState<ProfileTab>("following");
  const [nickname, setNickname] = useState(DEFAULT_NICKNAME);
  const [bio, setBio] = useState(DEFAULT_BIO);
  const [activeConv, setActiveConv] = useState(0);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [mute, setMute] = useState(false);

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
      <ProfileHeader nickname={nickname} tokenBalance={DEFAULT_TOKEN_BALANCE} />
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

      {tab === "edit" && (
        <EditProfileTab
          nickname={nickname}
          bio={bio}
          onNicknameChange={setNickname}
          onBioChange={setBio}
        />
      )}

      {tab === "tasks" && <DailyTasksTab />}
    </>
  );
}
