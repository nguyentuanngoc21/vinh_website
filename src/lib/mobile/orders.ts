import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

type Client = SupabaseClient<Database>;
type OrderRow = Database['public']['Tables']['orders']['Row'];

/** Adds the viewer's role and the other party's public name, which the app shows on every order. */
export async function withParties<T extends Pick<OrderRow, 'buyer_id' | 'seller_id'>>(client: Client, userId: string, orders: T[]) {
  const others = [...new Set(orders.map(o => (o.buyer_id === userId ? o.seller_id : o.buyer_id)))];
  const { data } = others.length
    ? await client.from('author_public_profiles').select('id,nickname,username').in('id', others)
    : { data: [] as { id: string; nickname: string | null; username: string | null }[] };
  const byId = new Map((data ?? []).map(p => [p.id, p]));
  return orders.map(o => {
    const role = o.buyer_id === userId ? 'buyer' as const : 'seller' as const;
    const otherId = role === 'buyer' ? o.seller_id : o.buyer_id;
    const other = byId.get(otherId);
    return { ...o, role, counterpart: { id: otherId, nickname: other?.nickname ?? null, username: other?.username ?? null } };
  });
}
