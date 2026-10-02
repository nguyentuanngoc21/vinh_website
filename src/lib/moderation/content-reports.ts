import { isUuid } from "@/lib/validation/uuid";

export const REPORT_REASONS = {
  offensive: "Nội dung phản cảm",
  age_rating: "Thiếu hoặc sai nhãn độ tuổi (16+, 18+…)",
  plagiarism: "Nghi ngờ đạo văn",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export type ContentReport = {
  id: string; reporter_id: string; book_id: string; chapter_id: string | null;
  reason: ReportReason; description: string; evidence_url: string | null;
  book_title: string; chapter_title: string | null; book_slug: string;
  status: "pending" | "reviewing" | "resolved" | "dismissed";
  resolution_note: string | null; reviewed_by: string | null;
  created_at: string; updated_at: string;
};

export function validateContentReport(body: unknown) {
  if (!body || typeof body !== "object") return { error: "Dữ liệu không hợp lệ." } as const;
  const b = body as Record<string, unknown>;
  if (typeof b.bookId !== "string" || !isUuid(b.bookId) ||
      (b.chapterId != null && (typeof b.chapterId !== "string" || !isUuid(b.chapterId))))
    return { error: "Tác phẩm/chương không hợp lệ." } as const;
  if (typeof b.reason !== "string" || !Object.hasOwn(REPORT_REASONS, b.reason))
    return { error: "Vui lòng chọn lý do báo cáo." } as const;
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.length < 10 || description.length > 3000)
    return { error: "Mô tả cần từ 10 đến 3.000 ký tự." } as const;
  const evidenceUrl = typeof b.evidenceUrl === "string" ? b.evidenceUrl.trim() : "";
  if (evidenceUrl) {
    try {
      const url = new URL(evidenceUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || evidenceUrl.length > 2000) throw new Error();
    } catch { return { error: "Nguồn đối chiếu phải là liên kết HTTP/HTTPS hợp lệ." } as const; }
  }
  return { value: { bookId: b.bookId, chapterId: (b.chapterId as string | null) ?? null,
    reason: b.reason as ReportReason, description, evidenceUrl: evidenceUrl || null } } as const;
}
