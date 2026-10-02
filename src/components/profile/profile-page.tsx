"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { EditProfileTab } from "@/components/profile/edit-profile-tab";
import { Skeleton } from "@/components/ui";
import { PROFILE_TABS, type ProfileTab } from "@/lib/profile";
import { chatThreadHref } from "@/lib/chat-thread-href";

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

  // URL là nguồn sự thật cho tab + luồng đang mở. useState ở trên chỉ đọc
  // searchParams LÚC MOUNT — khi ĐANG ở /ca-nhan mà bấm link chỉ đổi query
  // ("Xem tất cả trong Hội thoại", 1 dòng trong flyout tin nhắn trên
  // mobile, thẻ đơn ở bong bóng chat...), Next giữ nguyên component nên
  // state không đổi theo, trang đứng im. Điều chỉnh state ngay trong
  // render khi chuỗi query đổi (pattern "adjusting state when a prop
  // changes" của React, không cần effect).
  const paramsKey = searchParams.toString();
  const [syncedParamsKey, setSyncedParamsKey] = useState(paramsKey);
  if (paramsKey !== syncedParamsKey) {
    setSyncedParamsKey(paramsKey);
    if (chatWithParam) {
      setActiveUserId(chatWithParam);
      setActiveContext(contextParam);
      setMobileView("thread");
      setTab("chat");
    } else if (isProfileTab(tabParam)) {
      setTab(tabParam);
    }
  }

  // Ghi ngược tab/luồng đang mở lên URL (replaceState tích hợp với
  // useSearchParams của Next, không tải lại trang) — để link ?tab=chat
  // luôn có tác dụng kể cả khi người dùng đã tự chuyển sang tab khác
  // (URL cũ trùng URL link thì bấm vào không đổi gì), và mỗi hội thoại có
  // URL riêng để tải lại/chia sẻ đúng chỗ.
  const replaceUrl = (params: Record<string, string>) => {
    window.history.replaceState(null, "", `/ca-nhan?${new URLSearchParams(params).toString()}`);
  };
  const changeTab = (next: ProfileTab) => {
    setTab(next);
    replaceUrl({ tab: next });
  };

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
    window.history.replaceState(null, "", chatThreadHref(userId, "personal"));
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
      <ProfileTabs active={tab} onChange={changeTab} />

      {tab === "following" && <FollowingTab onMessage={openChatWith} />}

      {tab === "chat" && (
        <ChatTab
          activeUserId={activeUserId}
          activeContext={activeContext}
          onSelectUser={(userId, context) => {
            setActiveUserId(userId);
            setActiveContext(context);
            setMobileView("thread");
            window.history.replaceState(null, "", chatThreadHref(userId, context));
          }}
          mobileView={mobileView}
          onBack={() => {
            setMobileView("list");
            // Bỏ ?chat= khỏi URL — không thì bấm lại đúng luồng này từ flyout
            // tin nhắn (cùng URL) sẽ không đổi gì, kẹt ở danh sách.
            replaceUrl({ tab: "chat" });
          }}
        />
      )}

      {tab === "edit" && <EditProfileTab onNicknameSaved={setNickname} />}

      {tab === "services" && <ServicesTab />}

      {tab === "agree" && <AgreementsTab />}
    </>
  );
}
