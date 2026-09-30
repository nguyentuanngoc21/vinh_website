import type { CharacterRole, CharacterProfile } from "@/lib/supabase/types";
import { isUuid } from "@/lib/validation/uuid";

export const ROLE_LABEL: Record<CharacterRole, string> = { hero: "Chính diện", villain: "Phản diện", neutral: "Trung lập" };
export const STORY_ROLE_LABEL = { main: "Nhân vật chính", supporting: "Nhân vật phụ", cameo: "Khách mời" } as const;
export type StoryRole = keyof typeof STORY_ROLE_LABEL;
export type { CharacterProfile } from "@/lib/supabase/types";
export const CHARACTER_FIELDS = "id, name, role, trope, archived_at, is_public, show_role, story_role, aliases, avatar_url, description, private_notes, created_at";
/** Mirrors delete_recent_character: hard delete only shortly after creation. */
export const DELETE_WINDOW_MS = 15 * 60 * 1000;
export const CHARACTER_INPUT_KEYS = ["name", "role", "trope", "is_public", "show_role", "story_role", "aliases", "avatar_url", "description", "private_notes", "archived"];
type CharacterInput = Partial<Omit<CharacterProfile, "id" | "archived_at" | "created_at">> & { archived_at?: string | null };
const FIELD_LABELS: Record<string, string> = { name: "Tên nhân vật", trope: "Mẫu hình", aliases: "Biệt danh", avatar_url: "Ảnh đại diện", description: "Mô tả", private_notes: "Ghi chú riêng", is_public: "Trạng thái công khai", show_role: "Hiển thị chính/phản diện", archived: "Trạng thái lưu trữ" };

export function parseCharacterInput(body: unknown, creating: boolean): { data: CharacterInput; error?: never } | { error: string; data?: never } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Dữ liệu nhân vật không hợp lệ." };
  const b = body as Record<string, unknown>;
  const data: CharacterInput = {};
  for (const [key, limit] of Object.entries({ name: 60, trope: 40, aliases: 200, avatar_url: 2048, description: 2000, private_notes: 5000 })) {
    if (!(key in b) && !(creating && key === "name")) continue;
    const value = b[key];
    if (typeof value !== "string" && !(value === null && key !== "name")) return { error: `${FIELD_LABELS[key]} không hợp lệ.` };
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (key === "name" && !trimmed) return { error: "Vui lòng nhập tên nhân vật." };
    if (trimmed.length > limit) return { error: `${FIELD_LABELS[key]} tối đa ${limit} ký tự.` };
    if (key === "avatar_url" && trimmed) {
      try { const url = new URL(trimmed); if (url.protocol !== "https:" || url.username || url.password || /\s/.test(trimmed)) throw new Error(); }
      catch { return { error: "Ảnh đại diện cần là URL HTTPS hợp lệ." }; }
    }
    Object.assign(data, { [key]: trimmed || null });
  }
  if ("role" in b) {
    if (typeof b.role !== "string" || !Object.hasOwn(ROLE_LABEL, b.role)) return { error: "Phân loại chính/phản diện không hợp lệ." };
    data.role = b.role as CharacterRole;
  }
  if ("story_role" in b) {
    if (typeof b.story_role !== "string" || !Object.hasOwn(STORY_ROLE_LABEL, b.story_role)) return { error: "Vai trò trong truyện không hợp lệ." };
    data.story_role = b.story_role as StoryRole;
  }
  for (const key of ["is_public", "show_role", "archived"] as const) {
    if (!(key in b)) continue;
    if (typeof b[key] !== "boolean") return { error: `${FIELD_LABELS[key]} không hợp lệ.` };
    if (key === "archived") data.archived_at = b[key] ? new Date().toISOString() : null;
    else data[key] = b[key];
  }
  if (!creating && !Object.keys(data).length) return { error: "Không có thay đổi hợp lệ." };
  return { data };
}

export function parseCharacterIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 500 || value.some(id => typeof id !== "string" || !isUuid(id))) return null;
  return [...new Set(value as string[])];
}
