import { requireSupabase } from './supabase';

export type MessageRow = {
  id: string; sender_id: string; recipient_id: string; body: string; context: 'personal' | 'moderation';
  created_at: string; flagged_off_platform: boolean;
};
export type NotificationRow = { id: string; user_id: string; title: string; link: string | null; read_at: string | null; created_at: string };

// Realtime needs migrations/20260924_enable_realtime_messages_notifications.sql on the app's
// Supabase project. Rows are filtered by RLS for the signed-in session, and again by `filter` here.
let counter = 0;

/** New messages to or from the user (own messages cover sends from another device). Returns an unsubscribe. */
export function subscribeMessages(userId: string, onMessage: (row: MessageRow) => void) {
  const client = requireSupabase();
  const channel = client.channel(`messages:${userId}:${++counter}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${userId}` },
      payload => onMessage(payload.new as MessageRow))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${userId}` },
      payload => onMessage(payload.new as MessageRow))
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

export function subscribeNotifications(userId: string, onNotification: (row: NotificationRow) => void) {
  const client = requireSupabase();
  const channel = client.channel(`notifications:${userId}:${++counter}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      payload => onNotification(payload.new as NotificationRow))
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

/** Whether an incoming row belongs to the open thread (same counterpart and mailbox). */
export function belongsToThread(row: MessageRow, userId: string, counterpartId: string, context: string) {
  const pair = (row.sender_id === userId && row.recipient_id === counterpartId) || (row.sender_id === counterpartId && row.recipient_id === userId);
  return pair && row.context === context;
}
