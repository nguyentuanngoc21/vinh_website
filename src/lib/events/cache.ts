import { revalidateTag } from "next/cache";

export const PUBLIC_EVENTS_TAG = "public-events";

export function revalidatePublicEvents() {
  // Moderation/unpublishing must expire immediately, rather than serve stale once.
  revalidateTag(PUBLIC_EVENTS_TAG, { expire: 0 });
}
