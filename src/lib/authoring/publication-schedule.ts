export function vietnamScheduleTime(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  if (!Number.isFinite(date.getTime())) return null;
  // Reject calendar rollover such as February 31.
  if (new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16) !== value) return null;
  return date.toISOString();
}

export function isScheduleRequest(body: unknown): body is {
  id: string; chapterIds: string[]; startsAt: string; intervalDays: 0 | 1; price?: number;
} {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof b.id === "string" && uuid.test(b.id) && Array.isArray(b.chapterIds) &&
    b.chapterIds.length > 0 && b.chapterIds.length <= 300 &&
    b.chapterIds.every((id) => typeof id === "string" && uuid.test(id)) && new Set(b.chapterIds).size === b.chapterIds.length &&
    typeof b.startsAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(b.startsAt) && Number.isFinite(Date.parse(b.startsAt)) &&
    (b.intervalDays === 0 || b.intervalDays === 1) &&
    (b.price === undefined || (typeof b.price === "number" && Number.isInteger(b.price) && b.price >= 0 && b.price <= 2147483647));
}
