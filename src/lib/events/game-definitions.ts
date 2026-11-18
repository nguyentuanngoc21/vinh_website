import type { EventGame } from "./catalog";
// Register approved games here, then implement the matching component in games/registry.tsx.
// Event creators cannot supply arbitrary scripts, iframes or game URLs.
export const EVENT_GAME_DEFINITIONS: readonly EventGame[] = [{ id: "dino-run", title: "Dino Run", description: "Bốn khủng long cùng vượt thử thách — tạo phòng hoặc tham gia cùng bạn bè." }];
