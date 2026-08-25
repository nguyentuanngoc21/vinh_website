export type SharePayload = { title: string; text: string; url: string };

/**
 * navigator.share() khi có (điện thoại — hệ điều hành tự đưa ra
 * Facebook/Threads/TikTok/Instagram/Messenger... trong share sheet, nên
 * không cần tự làm nút riêng cho từng nền tảng — TikTok/Instagram vốn
 * không có web share-intent URL để làm nút trực tiếp được). Rơi xuống
 * clipboard trên desktop (không có navigator.share). Người gọi chỉ hiện
 * thông báo "Đã sao chép liên kết" khi kết quả là "copied".
 */
export async function shareOrCopy(payload: SharePayload): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share(payload);
      return "shared";
    } catch (err) {
      // Người dùng tự đóng share sheet — không phải lỗi thật, đừng rơi
      // xuống clipboard (dễ gây khó hiểu: vừa đóng sheet vừa thấy "đã copy").
      if (err instanceof Error && err.name === "AbortError") return "shared";
      // Lỗi khác (thiếu quyền, API không hỗ trợ payload...) — thử clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(payload.url);
    return "copied";
  } catch {
    return "failed";
  }
}
