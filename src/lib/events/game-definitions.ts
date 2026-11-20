import type { EventGame } from "./catalog";
// Register approved games here, then implement the matching component in games/registry.tsx.
// Event creators cannot supply arbitrary scripts, iframes or game URLs.
export const EVENT_GAME_DEFINITIONS: readonly EventGame[] = [{ id: "ky-nhan-hoi", title: "Kỳ Nhân Hội — 5 trò chơi", description: "Chơi Guest không cần tài khoản, hoặc đăng nhập Vịnh để lưu điểm và bộ sưu tập." }, { id: "dino-run", title: "Dino Run", description: "Bốn khủng long cùng vượt thử thách — tạo phòng hoặc tham gia cùng bạn bè." }];
