// Danh sách bước của tour hướng dẫn người dùng mới (spotlight overlay kiểu
// Jira). `target` là CSS selector trỏ tới data-tour="..." gắn trên phần tử
// thật; `null` nghĩa là bước hiện thẻ ở giữa màn hình, không highlight gì
// (dùng cho lời chào đầu/cuối). Nếu selector không khớp phần tử nào tại thời
// điểm chạy (ví dụ khách chưa đăng nhập nên không có avatar), engine tự bỏ
// qua bước đó — xem product-tour.tsx.
export type TourStep = {
  id: string;
  target: string | null;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Chào mừng đến Vịnh 👋",
    body: "Xem nhanh vài điểm chính trên trang chủ trước khi bắt đầu nhé?",
  },
  {
    id: "nav",
    target: '[data-tour="tour-nav"]',
    title: "Menu chuyên mục",
    body: "Chuyển giữa Truyện chữ, Audio, Blog, Thiết kế, Kết nối và Bảng xếp hạng.",
    placement: "bottom",
  },
  {
    id: "search",
    target: '[data-tour="tour-search"]',
    title: "Tìm kiếm",
    body: "Tìm nhanh truyện hoặc tác giả theo tên.",
    placement: "bottom",
  },
  {
    id: "bookmark",
    target: '[data-tour="tour-bookmark"]',
    title: "Đã lưu",
    body: "Lưu lại truyện yêu thích để đọc sau.",
    placement: "left",
  },
  {
    id: "cta",
    target: '[data-tour="tour-cta"]',
    title: "Viết truyện",
    body: "Là tác giả? Bắt đầu đăng tác phẩm mới tại đây.",
    placement: "left",
  },
  {
    id: "avatar",
    target: '[data-tour="tour-avatar"]',
    title: "Tài khoản của bạn",
    body: "Quản lý thông tin cá nhân, ví token và tác phẩm đã đăng.",
    placement: "left",
  },
  {
    id: "done",
    target: null,
    title: "Vậy là xong! 🎉",
    body: "Bạn có thể bắt đầu khám phá Vịnh ngay bây giờ.",
  },
];
