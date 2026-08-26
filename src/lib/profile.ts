export type ProfileTab = "following" | "chat" | "edit" | "tasks";

export const PROFILE_TABS: { id: ProfileTab; label: string; icon: string }[] = [
  { id: "edit", label: "Thông tin cá nhân", icon: "pencil" },
  { id: "chat", label: "Hội thoại", icon: "chat" },
  { id: "following", label: "Đang theo dõi", icon: "users" },
  { id: "tasks", label: "Nhiệm vụ ngày", icon: "target" },
];

export const AVATAR_TONES = ["#2F5D6E", "#7A5C3E", "#4A5D3A", "#6B4356", "#3D4B77", "#8A6B2F"];

export type FollowedPerson = { name: string; meta: string };

export const FOLLOWED_PEOPLE: FollowedPerson[] = [
  { name: "Lam Thư", meta: "Tác giả · 12 truyện · 8.4k theo dõi" },
  { name: "Hạ Vũ", meta: "Họa sĩ bìa · 240 thiết kế" },
  { name: "Trần Bách", meta: "Tác giả · Trinh thám đô thị" },
  { name: "Ngọc Diệp", meta: "Giọng đọc · 96 audio" },
  { name: "Vũ Kiên", meta: "Biên tập viên · Vịnh Studio" },
  { name: "Mai An", meta: "Tác giả · Ngôn tình cổ đại" },
];

export type Conversation = {
  name: string;
  snippet: string;
  time: string;
  unread: boolean;
  status: string;
};

export const CONVERSATIONS: Conversation[] = [
  { name: "Lam Thư", snippet: "Chương mới mình gửi bạn đọc thử nhé", time: "09:42", unread: true, status: "Đang hoạt động" },
  { name: "Hạ Vũ", snippet: "Bìa bản 2 đây, tông trầm hơn", time: "Hôm qua", unread: false, status: "Đang hoạt động" },
  { name: "Nhóm Vịnh Studio", snippet: "Kiên: họp lúc 20h nha cả nhà", time: "Hôm qua", unread: true, status: "6 thành viên" },
  { name: "Trần Bách", snippet: "Cảm ơn bạn đã ủng hộ 50 token!", time: "T4", unread: false, status: "Đang hoạt động" },
  { name: "Ngọc Diệp", snippet: "Mình thu xong tập 12 rồi", time: "T3", unread: false, status: "Đang hoạt động" },
  { name: "Mai An", snippet: "Bạn đọc tới chương mấy rồi?", time: "12/06", unread: false, status: "Đang hoạt động" },
];

export type ThreadMessage = { text: string; mine: boolean };

export const THREADS: ThreadMessage[][] = [
  [
    { text: "Chào Khôi, chương mới mình vừa viết xong", mine: false },
    { text: "Gửi mình đọc thử với!", mine: true },
    { text: "Chương này dài hơn bình thường, khoảng 4k chữ", mine: false },
    { text: "Ok mình đọc tối nay rồi góp ý nhé", mine: true },
    { text: "Chương mới mình gửi bạn đọc thử nhé", mine: false },
  ],
  [
    { text: "Bìa bản 2 đây, tông trầm hơn", mine: false },
    { text: "Đẹp hơn bản 1 nhiều", mine: true },
  ],
  [
    { text: "Kiên: họp lúc 20h nha cả nhà", mine: false },
    { text: "Mình có mặt", mine: true },
  ],
  [
    { text: "Cảm ơn bạn đã ủng hộ 50 token!", mine: false },
    { text: "Truyện hay mà, xứng đáng", mine: true },
  ],
  [
    { text: "Mình thu xong tập 12 rồi", mine: false },
    { text: "Tuyệt vời, để mình nghe thử", mine: true },
  ],
  [
    { text: "Bạn đọc tới chương mấy rồi?", mine: false },
    { text: "Chương 27, đang cày tiếp", mine: true },
  ],
];

export type TokenLogEntry = { label: string; amount: string };

export const TOKEN_LOGS: TokenLogEntry[] = [
  { label: "Nhiệm vụ ngày · 12/06", amount: "+45" },
  { label: "Mở chương sớm · Vịnh Đêm", amount: "−30" },
  { label: "Tặng tác giả Lam Thư", amount: "−50" },
];

export type DailyTask = {
  id: string;
  title: string;
  desc: string;
  icon: "book" | "comment" | "headphones" | "share";
  reward: number;
  progress: number;
};

export const DAILY_TASKS: DailyTask[] = [
  { id: "t1", title: "Đọc 3 chương truyện", desc: "Đã đọc 3/3 chương hôm nay", icon: "book", reward: 20, progress: 1 },
  { id: "t2", title: "Bình luận cho tác giả", desc: "Đã gửi 1/2 bình luận", icon: "comment", reward: 15, progress: 0.5 },
  { id: "t3", title: "Nghe 15 phút audio", desc: "Đã nghe 6/15 phút", icon: "headphones", reward: 25, progress: 0.4 },
  { id: "t4", title: "Chia sẻ một tác phẩm", desc: "Chưa hoàn thành", icon: "share", reward: 10, progress: 0 },
];

export const DEFAULT_NICKNAME = "Minh Khôi";
export const DEFAULT_BIO =
  'Người kể chuyện bán thời gian, mê truyện trinh thám và những buổi sáng Hà Nội. Đang viết dở "Vịnh Đêm".';
// Numeric source of truth (also used by the token top-up flow, see
// lib/topup.ts) — the display string below is just it, locale-formatted.
export const DEFAULT_TOKEN_BALANCE_NUM = 1240;
export const DEFAULT_TOKEN_BALANCE = DEFAULT_TOKEN_BALANCE_NUM.toLocaleString("vi-VN");
