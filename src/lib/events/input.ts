import type { CommunityEventRow } from "@/lib/supabase/types";
export const EVENT_BANNER_MAX_BYTES = 10 * 1024 * 1024;
export const EVENT_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
export type EventInput = Omit<CommunityEventRow, "id" | "organizer_id" | "created_at" | "updated_at" | "hidden" | "games">;
export function parseEventInput(body: unknown): { data: EventInput } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Dữ liệu sự kiện không hợp lệ." };
  const raw = body as Record<string, unknown>;
  const text = (key: string) => typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
  const limits: [string, number, number, string][] = [
    ["title", 3, 160, "Tên sự kiện"], ["summary", 1, 500, "Giới thiệu ngắn"], ["overview", 1, 20000, "Thông tin tổng quan"],
    ["venue", 1, 200, "Tên địa điểm"], ["address", 1, 500, "Địa chỉ"], ["city", 1, 100, "Tỉnh / thành phố"],
    ["category", 1, 100, "Chủ đề"], ["organizer_bio", 0, 500, "Giới thiệu người tổ chức"],
  ];
  for (const [key, min, max, label] of limits) {
    if (text(key).length < min || text(key).length > max) return { error: `${label}: cần từ ${min} đến ${max} ký tự.` };
  }
  const starts = text("starts_at"), ends = text("ends_at");
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!timestamp.test(starts) || !timestamp.test(ends) || !Number.isFinite(Date.parse(starts)) || !Number.isFinite(Date.parse(ends)) || Date.parse(ends) <= Date.parse(starts)) {
    return { error: "Thời gian kết thúc phải sau thời gian bắt đầu; hãy nhập đủ ngày và giờ." };
  }
  if (raw.price_vnd !== null && (typeof raw.price_vnd !== "number" || !Number.isSafeInteger(raw.price_vnd) || raw.price_vnd < 0 || raw.price_vnd > 100000000)) {
    return { error: "Giá vé cần là số nguyên từ 0 đến 100.000.000 đồng, hoặc để trống nếu chưa công bố." };
  }
  const ticket = text("ticket_url");
  if (ticket) {
    try { const url = new URL(ticket); if (url.protocol !== "https:" || url.username || url.password || ticket.length > 2000) throw new Error(); }
    catch { return { error: "Liên kết vé phải là một địa chỉ HTTPS hợp lệ." }; }
  }
  if (raw.status !== "draft" && raw.status !== "published") return { error: "Trạng thái sự kiện không hợp lệ." };
  const notes = raw.travel_notes && typeof raw.travel_notes === "object" && !Array.isArray(raw.travel_notes) ? raw.travel_notes as Record<string, unknown> : {};
  const travel: Record<string, string> = {};
  for (const mode of ["driving", "transit", "bicycling", "walking"]) {
    if (notes[mode] !== undefined && (typeof notes[mode] !== "string" || (notes[mode] as string).length > 1000)) return { error: "Hướng dẫn di chuyển tối đa 1.000 ký tự mỗi phương tiện." };
    travel[mode] = typeof notes[mode] === "string" ? (notes[mode] as string).trim() : "";
  }
  return { data: {
    title: text("title"), summary: text("summary"), overview: text("overview"), starts_at: starts, ends_at: ends,
    venue: text("venue"), address: text("address"), city: text("city"), price_vnd: raw.price_vnd as number | null,
    ticket_url: ticket || null, banner_path: text("banner_path") || null, category: text("category"),
    organizer_bio: text("organizer_bio"), travel_notes: travel, status: raw.status,
  } };
}
