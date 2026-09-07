/**
 * Mẫu nội dung thông báo gỡ chương — 2 lớp sinh từ cùng 1 bộ biến, đúng
 * đặc tả admin đã cung cấp:
 *   (A) Notification — dòng ngắn, hiện trong chuông Thông báo, có tính
 *       "trigger" để tác giả bấm vào.
 *   (B) Tin nhắn hệ thống — nội dung đầy đủ, gửi qua direct_messages từ
 *       tài khoản is_system=true (xem scripts/create-system-account.mjs),
 *       hiện trong Hội thoại khi tác giả bấm vào (A).
 *
 * Đơn giản hoá 1 chỗ so với đặc tả gốc: bỏ {{link_khiếu_nại}} dạng nút
 * riêng — đặc tả gốc đã tự đề xuất phương án này ("cân nhắc để
 * link_khiếu_nại là optional... nếu muốn đơn giản hóa luồng phản hồi chỉ
 * qua chat"), và repo hiện KHÔNG có trang form khiếu nại nào để trỏ tới
 * (Trung tâm trợ giúp/Liên hệ ở footer chỉ là label tĩnh, chưa có href) —
 * trỏ tới 1 route không tồn tại sẽ tệ hơn là bỏ hẳn. Tác giả trả lời
 * ngay trong luồng Hội thoại (đã có sẵn, tin nhắn hệ thống nằm chung
 * thread) thay vì qua form riêng.
 */

export type ReasonGroupId =
  | "vi_pham_noi_dung"
  | "khieu_nai_ban_quyen"
  | "yeu_cau_tac_gia_phap_ly"
  | "chua_xac_dinh";

export type ReasonGroup = {
  id: ReasonGroupId;
  label: string;
  /** Rỗng ([]) = không có sub-reason cố định, admin chỉ nhập tay (nhóm 4). */
  subReasons: string[];
  /** Nhóm 3: yêu cầu đến từ chính tác giả/cơ quan thẩm quyền — không cần
   * mời khiếu nại (đặc tả gốc: "nhóm này không cần nút khiếu nại riêng"). */
  invitesComplaint: boolean;
};

export const REASON_GROUPS: ReasonGroup[] = [
  {
    id: "vi_pham_noi_dung",
    label: "Vi phạm Chính sách Nội dung",
    subReasons: [
      "Nội dung khiêu dâm / 18+ không gắn nhãn",
      "Bạo lực, kích động thù hận",
      "Đạo văn / sao chép tác phẩm khác",
      "Spam, nội dung rác, quảng cáo trái phép",
    ],
    invitesComplaint: true,
  },
  {
    id: "khieu_nai_ban_quyen",
    label: "Khiếu nại bản quyền",
    subReasons: [
      "Khiếu nại từ chủ sở hữu bản quyền gốc",
      "Nghi vấn đăng lại nội dung chưa được cấp phép",
      "Tranh chấp quyền sở hữu giữa các tác giả trên nền tảng",
    ],
    invitesComplaint: true,
  },
  {
    id: "yeu_cau_tac_gia_phap_ly",
    label: "Yêu cầu từ tác giả / Yêu cầu pháp lý khác",
    subReasons: ["Chính tác giả yêu cầu gỡ chương", "Yêu cầu từ cơ quan có thẩm quyền"],
    invitesComplaint: false,
  },
  {
    id: "chua_xac_dinh",
    label: "Chưa xác định / Mẫu chung",
    subReasons: [],
    invitesComplaint: false,
  },
];

export function reasonGroupLabel(id: ReasonGroupId): string {
  return REASON_GROUPS.find((g) => g.id === id)?.label ?? id;
}

export const DEFAULT_RESPONSE_DAYS = 7;

type TemplateInput = {
  group: ReasonGroupId;
  chapterTitle: string;
  bookTitle: string;
  /** {{chi_tiết}} — sub-reason đã chọn, hoặc admin tự nhập, hoặc kết hợp
   * cả 2 ("<sub-reason>: <ghi chú thêm>"). Rỗng cho nhóm "chưa xác định"
   * (template nhóm đó không dùng biến này). */
  detail: string;
  responseDays?: number;
};

/** (A) — luôn 1 câu, không lặp lại {{chi_tiết}} (đặc tả: "giữ ngắn và có
 * tính trigger", toàn bộ chi tiết nằm ở (B)). */
export function buildRemovalNotificationText({ group, chapterTitle, bookTitle }: TemplateInput): string {
  const base = `Chương "${chapterTitle}" trong truyện "${bookTitle}"`;
  switch (group) {
    case "vi_pham_noi_dung":
      return `${base} đã bị gỡ do vi phạm chính sách nội dung. Bấm để xem chi tiết.`;
    case "khieu_nai_ban_quyen":
      return `${base} đã bị tạm gỡ do khiếu nại bản quyền. Bấm để xem chi tiết.`;
    case "yeu_cau_tac_gia_phap_ly":
      return `${base} đã bị gỡ theo yêu cầu. Bấm để xem chi tiết.`;
    case "chua_xac_dinh":
      return `${base} đã bị gỡ. Bấm để xem chi tiết.`;
  }
}

/** (B) — nội dung đầy đủ trong Hội thoại. */
export function buildRemovalSystemMessage({
  group,
  chapterTitle,
  bookTitle,
  detail,
  responseDays = DEFAULT_RESPONSE_DAYS,
}: TemplateInput): string {
  const greeting = "Chào bạn,";
  const signOff = "Trân trọng,\nĐội ngũ Vịnh";

  switch (group) {
    case "vi_pham_noi_dung":
      return [
        greeting,
        "",
        `Chương ${chapterTitle} của truyện ${bookTitle} đã bị gỡ vì vi phạm Chính sách Nội dung của Vịnh (${detail}).`,
        "",
        `Nếu bạn cho rằng đây là nhầm lẫn hoặc muốn phản hồi, xin hãy trả lời trực tiếp tại đây trong vòng ${responseDays} ngày kể từ khi nhận được tin nhắn này — đội ngũ Vịnh sẽ xem xét và phản hồi sớm nhất có thể.`,
        "",
        signOff,
      ].join("\n");
    case "khieu_nai_ban_quyen":
      return [
        greeting,
        "",
        `Chương ${chapterTitle} của truyện ${bookTitle} đã bị tạm gỡ do nhận được khiếu nại vi phạm bản quyền (${detail}).`,
        "",
        `Theo quy định về sở hữu trí tuệ, Vịnh tạm gỡ nội dung trong khi xác minh. Nếu bạn tin rằng chương này không vi phạm bản quyền, xin hãy trả lời trực tiếp tại đây kèm bằng chứng quyền sở hữu, trong vòng ${responseDays} ngày.`,
        "",
        signOff,
      ].join("\n");
    case "yeu_cau_tac_gia_phap_ly":
      return [
        greeting,
        "",
        `Chương ${chapterTitle} của truyện ${bookTitle} đã bị gỡ theo yêu cầu (${detail}).`,
        "",
        "Nếu bạn có thắc mắc về quyết định này, xin hãy trả lời trực tiếp tại đây hoặc liên hệ đội ngũ Vịnh qua mục Hỗ trợ.",
        "",
        signOff,
      ].join("\n");
    case "chua_xac_dinh":
      return [
        greeting,
        "",
        `Chương ${chapterTitle} của truyện ${bookTitle} đã bị gỡ. Lý do cụ thể sẽ được cập nhật trong thời gian sớm nhất.`,
        "",
        "Nếu bạn muốn phản hồi, xin hãy trả lời trực tiếp tại đây, đội ngũ Vịnh sẽ hỗ trợ bạn sớm nhất có thể.",
        "",
        signOff,
      ].join("\n");
  }
}

/** Ghép sub-reason đã chọn + ghi chú tự do (nếu có) thành {{chi_tiết}}. */
export function buildDetailText(subReason: string | null, freeText: string | null): string {
  const note = (freeText ?? "").trim();
  const sub = (subReason ?? "").trim();
  if (sub && note) return `${sub}: ${note}`;
  return note || sub;
}
