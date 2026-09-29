"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { EditProfileTab } from "@/components/profile/edit-profile-tab";
import { Skeleton } from "@/components/ui";
import { PROFILE_TABS, type ProfileTab } from "@/lib/profile";

// Mỗi lúc chỉ hiện 1 tab, nên các tab không phải mặc định được tải lười
// (next/dynamic) — ServicesTab (~1000 dòng), ChatTab, AgreementsTab (kéo
// HTML văn bản pháp lý qua registry.ts)... không còn nằm trong bundle ban
// đầu của /ca-nhan. EditProfileTab là tab mặc định nên giữ import tĩnh để
// lần vào trang đầu tiên không bị nháy placeholder.
function TabLoading() {
  return (
    <div aria-busy="true" aria-label="Đang tải" className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
      <Skeleton className="mb-4 h-10 w-full max-w-[360px] rounded-[10px]" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-[var(--radius-md)]" />
        ))}
      </div>
    </div>
  );
}

const FollowingTab = dynamic(
  () => import("@/components/profile/following-tab").then((m) => m.FollowingTab),
  { loading: TabLoading },
);
const ChatTab = dynamic(() => import("@/components/profile/chat-tab").then((m) => m.ChatTab), {
  loading: TabLoading,
});
const ServicesTab = dynamic(
  () => import("@/components/profile/services-tab").then((m) => m.ServicesTab),
  { loading: TabLoading },
);
const AgreementsTab = dynamic(
  () => import("@/components/profile/agreements-tab").then((m) => m.AgreementsTab),
  { loading: TabLoading },
);

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
  // "?context=moderation" — chỉ dùng khi deep-link tới từ chuông Thông
  // báo (gỡ chương), xem link trong api/admin/chapters/[chapterId]/route.ts.
  // Mọi lối vào khác (Kết nối, Đang theo dõi) không truyền context, mặc
  // định "personal". Xem migrations/archive/20260908_add_direct_message_context.sql.
  const contextParam = searchParams.get("context") === "moderation" ? "moderation" : "personal";

  const [tab, setTab] = useState<ProfileTab>(
    chatWithParam ? "chat" : isProfileTab(tabParam) ? tabParam : "edit"
  );
  const [activeUserId, setActiveUserId] = useState<string | null>(chatWithParam);
  const [activeContext, setActiveContext] = useState<"personal" | "moderation">(contextParam);
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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
        setAvatarUrl(me.avatarUrl ?? null);
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
    setActiveContext("personal");
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
        avatarUrl={avatarUrl}
        onAvatarSaved={setAvatarUrl}
      />
      <ProfileTabs active={tab} onChange={setTab} />

      {tab === "following" && <FollowingTab onMessage={openChatWith} />}

      {tab === "chat" && (
        <ChatTab
          activeUserId={activeUserId}
          activeContext={activeContext}
          onSelectUser={(userId, context) => {
            setActiveUserId(userId);
            setActiveContext(context);
            setMobileView("thread");
          }}
          mobileView={mobileView}
          onBack={() => setMobileView("list")}
        />
      )}

      {tab === "edit" && <EditProfileTab onNicknameSaved={setNickname} />}

      {tab === "services" && <ServicesTab />}

      {tab === "agree" && <AgreementsTab />}
    </>
  );
}
