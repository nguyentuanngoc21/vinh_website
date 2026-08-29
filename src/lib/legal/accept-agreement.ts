export type MissingField = { key: string; label: string };

/**
 * POST /api/profile/agreements/:id/accept — dùng chung bởi agreements-tab.tsx
 * (nút "Xác nhận" ở bảng) và agreement-document-viewer.tsx (nút "Tôi đồng
 * ý" trong popup, cả từ tab Cam kết & Thỏa thuận lẫn required-agreements-modal.tsx).
 * Server LUÔN là chốt chặn thật cho việc "đủ thông tin chưa" — trả 400 +
 * `missingFields` khi thiếu (xem route), không phải lỗi chung chung.
 */
export async function acceptAgreement(
  agreementId: string
): Promise<{ ok: true } | { ok: false; error: string; missingFields?: MissingField[] }> {
  const res = await fetch(`/api/profile/agreements/${agreementId}/accept`, { method: "POST" });
  if (res.ok) return { ok: true };

  const data = await res.json().catch(() => null);
  return {
    ok: false,
    error: (data && typeof data.error === "string" && data.error) || "Xác nhận thất bại. Vui lòng thử lại.",
    missingFields: Array.isArray(data?.missingFields) ? data.missingFields : undefined,
  };
}

/**
 * URL sang tab "Chỉnh sửa thông tin cá nhân" (/ca-nhan) để điền field còn
 * thiếu — kéo theo `agreement` (tên thỏa thuận cho banner) và `missing`
 * (danh sách key để highlight + cuộn tới đúng ô, xem edit-profile-tab.tsx).
 */
export function missingInfoUrl(agreementId: string, missingFields: MissingField[]): string {
  const params = new URLSearchParams();
  params.set("tab", "edit");
  params.set("agreement", agreementId);
  params.set("missing", missingFields.map((f) => f.key).join(","));
  return `/ca-nhan?${params.toString()}`;
}
