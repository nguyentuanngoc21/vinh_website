"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { FollowingTab } from "@/components/profile/following-tab";
import { ChatTab } from "@/components/profile/chat-tab";
import { EditProfileTab } from "@/components/profile/edit-profile-tab";
import { ServicesTab } from "@/components/profile/services-tab";
import { AgreementsTab } from "@/components/profile/agreements-tab";
import { DailyTasksTab } from "@/components/profile/daily-tasks-tab";
import { PROFILE_TABS, type ProfileTab } from "@/lib/profile";

function isProfileTab(value: string | null): value is ProfileTab {
  return !!value && PROFILE_TABS.some((t) => t.id === value);
}

export function ProfilePage() {
  // ?chat=<userId> — deep link "Nhắn tin" từ /ket-noi hoặc following-tab.tsx
  // (nút đó điều hướng tới đây thay vì mở modal riêng). ?tab=<id> — lối
  // tắt chung sang 1 tab bất kỳ (vd "?tab=agree" từ nút "Đi tới Cam kết &
  // Thỏa thuận" ở required-agreements-modal.tsx khi chặn xuất bản độc
  // quyền). useSearchParams() cần Suspense boundary ở cha — xem
  // app/ca-nhan/page.tsx.
  const searchParams = useSearchParams();
  const chatWithParam = searchParams.get("chat");
  const tabParam = searchParams.get("tab");

  const [tab, setTab] = useState<ProfileTab>(
    chatWithParam ? "chat" : isProfileTab(tabParam) ? tabParam : "edit"
  );
  const [activeUserId, setActiveUserId] = useState<string | null>(chatWithParam);
  const [mobileView, setMobileView] = useState<"list" | "thread">(chatWithParam ? "thread" : "list");

  // Header hiển thị trên MỌI tab (không chỉ tab "edit"), nên fetch riêng
  // ở đây thay vì đọc state của EditProfileTab — 2 nơi cùng gọi
  // GET /api/profile/me độc lập là chấp nhận được, cùng pattern
  // BankInfoForm/IdentityForm đã dùng (mỗi widget tự fetch dữ liệu của
  // mình, không có tầng cache chung).
  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [joinedYear, setJoinedYear] = useState("");
  const [tokenBalance, setTokenBalance] = useState("…");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [followingCount, setFollowingCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);

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
        setCoverImageUrl(me.coverImageUrl ?? null);
        setFollowingCount(me.followingCount ?? 0);
        setFollowerCount(me.followerCount ?? 0);
      }
      if (balance) setTokenBalance(Number(balance.available ?? 0).toLocaleString("vi-VN"));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nút "Nhắn tin" ở following-tab.tsx (và ?chat= khi tới từ /ket-noi)
  // đều gọi qua đây — id THẬT (profiles.id), không phải index vào mảng
  // mock như trước.
  const openChatWith = (userId: string) => {
    setActiveUserId(userId);
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
        followingCount={followingCount}
        followerCount={followerCount}
        coverImageUrl={coverImageUrl}
        onCoverSaved={setCoverImageUrl}
      />
      <ProfileTabs active={tab} onChange={setTab} />

      {tab === "following" && <FollowingTab onMessage={openChatWith} />}

      {tab === "chat" && (
        <ChatTab
          activeUserId={activeUserId}
          onSelectUser={(userId) => {
            setActiveUserId(userId);
            setMobileView("thread");
          }}
          mobileView={mobileView}
          onBack={() => setMobileView("list")}
        />
      )}

      {tab === "edit" && <EditProfileTab onNicknameSaved={setNickname} />}

      {tab === "services" && <ServicesTab />}

      {tab === "agree" && <AgreementsTab />}

      {tab === "tasks" && <DailyTasksTab />}
    </>
  );
}
