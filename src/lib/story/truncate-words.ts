// Cắt đoạn mô tả truyện theo SỐ CHỮ (từ cách nhau bởi khoảng trắng — với
// tiếng Việt mỗi "chữ" là 1 âm tiết), không theo số ký tự, để không bao
// giờ cắt giữa 1 chữ. Dùng ở carousel "Tác phẩm nổi bật" trang chủ.

export function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  // Bỏ dấu câu dính cuối chữ cuối cùng để không ra ",..." hay "....".
  const kept = words.slice(0, maxWords).join(" ").replace(/[.,;:!?…\-–—]+$/, "");
  return `${kept}...`;
}
