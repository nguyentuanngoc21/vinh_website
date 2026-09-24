import { mobileApi } from './api';

export type QuestSlot = {
  slotIndex: number; taskTemplateId: string; userDailyTaskId: string; title: string; description: string | null;
  questType: string | null; targetCount: number; rewardTokens: number; progress: number;
  completed: boolean; claimed: boolean; resetCount: number;
};
export type QuestPool = { poolDate: string | null; slots: QuestSlot[]; resetsUsedToday: number; maxResetsPerDay: number };
export type Achievement = {
  id: string; code: string; forRole: 'author' | 'narrator' | 'designer' | null; title: string; description: string | null;
  icon: string | null; rewardTokens: number; unlocked: boolean; unlockedAt: string | null;
  progress: { current: number; target: number } | null;
};

// Same labels as the web's daily-tasks-tab.
const QUEST_TYPE_LABELS: Record<string, string> = {
  discovery: 'Khám phá', engagement: 'Tương tác', lore_hunt: 'Truy tìm chi tiết',
  cross_compare: 'So sánh', prediction: 'Dự đoán', topup: 'Nạp xu',
};
export function questTypeLabel(type: string | null) { return (type && QUEST_TYPE_LABELS[type]) || 'Nhiệm vụ'; }

export function getQuestPool(userId: string) { return mobileApi<QuestPool>('quests', userId); }
/** `taskId` is user_daily_tasks.id, not the template id (same as the web). */
export function claimQuest(userId: string, taskId: string) { return mobileApi<{ ok: true }>('quests/claim', userId, { taskId }); }
/** The server picks the replacement and enforces the shared daily reset budget. */
export function resetQuest(userId: string, taskTemplateId: string) { return mobileApi<{ ok: true }>('quests/reset', userId, { taskTemplateId }); }
export async function getAchievements(userId: string) {
  return (await mobileApi<{ achievements: Achievement[] }>('achievements', userId)).achievements;
}

export type RoleKey = 'reader' | 'author' | 'narrator' | 'designer';
export const ROLE_ORDER: RoleKey[] = ['reader', 'author', 'narrator', 'designer'];
export const ROLE_LABELS: Record<RoleKey, string> = { reader: 'Đọc giả', author: 'Tác giả', narrator: 'Người thu âm', designer: 'Thiết kế' };
export function groupByRole(items: Achievement[]) {
  return ROLE_ORDER.map(role => ({ role, items: items.filter(a => (a.forRole ?? 'reader') === role) })).filter(g => g.items.length);
}
