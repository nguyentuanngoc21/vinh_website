/**
 * Mọi hạn của cuộc thi hiển thị và nhập theo giờ Việt Nam (GMT+7, không có
 * giờ mùa hè) — XIX.2. <input type="datetime-local"> không mang múi giờ, nên
 * đổi qua lại ở đây thay vì để trình duyệt tự hiểu theo máy người dùng.
 */
const VN_OFFSET_MS = 7 * 3_600_000;

/** "2026-10-20T23:59" (giờ VN) → ISO UTC. null nếu chuỗi không hợp lệ. */
export function vnLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const utc = Date.UTC(y, mo - 1, d, h, mi, s || 0) - VN_OFFSET_MS;
  const date = new Date(utc);
  // Chặn ngày không tồn tại (31/02 bị Date.UTC tràn sang tháng sau).
  const back = new Date(utc + VN_OFFSET_MS);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return date.toISOString();
}

/** ISO → "2026-10-20T23:59" (giờ VN) cho value của datetime-local. */
export function isoToVnLocal(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + VN_OFFSET_MS).toISOString().slice(0, 16);
}

/** "23:59 20/10/2026" — chuỗi hiển thị hạn chót. */
export function formatVnDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
