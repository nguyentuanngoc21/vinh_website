import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { EVENT_BANNER_MAX_BYTES, EVENT_IMAGE_TYPES } from "./input";

export async function validateEventBanner(client: SupabaseClient<Database>, userId: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  if (!path.startsWith(`${userId}/event-`) || !/^[a-f\d-]+\/event-[a-f\d-]+\.(jpg|png|webp)$/.test(path)) return "Ảnh bìa không thuộc tài khoản của bạn.";
  const { data, error } = await client.storage.from("event-banners").info(path);
  if (error || !data || !data.size || data.size > EVENT_BANNER_MAX_BYTES || !data.contentType || EVENT_IMAGE_TYPES[data.contentType] !== path.split(".").at(-1)) return "Không xác minh được ảnh bìa. Chỉ nhận JPG, PNG, WebP tối đa 10 MB.";
  return null;
}
