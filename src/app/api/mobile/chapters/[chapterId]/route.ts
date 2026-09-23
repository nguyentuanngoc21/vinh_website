import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { buildContentPreview } from '@/lib/reading/access-gate';

// Token-only API: CORS supports Expo web previews without cookie credentials.
const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...headers,
    'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization' } });
}
export async function GET(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chapterId)) return json({ error: 'Invalid chapter' }, 400);
  // Mobile can target production while the local website uses its development DB.
  const url = process.env.MOBILE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.MOBILE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return json({ error: 'Server not configured' }, 503);
  const authorization = request.headers.get('authorization');
  if (authorization && !/^Bearer \S+$/i.test(authorization)) return json({ error: 'Invalid token' }, 401);
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: authorization ? { Authorization: authorization } : {} },
  });
  try {
    let viewerId: string | null = null;
    if (authorization) {
      const { data, error } = await client.auth.getUser(authorization.slice(7));
      if (error || !data.user) return json({ error: 'Invalid token' }, 401);
      viewerId = data.user.id;
    }
    const { data: chapter, error } = await client.from('chapters')
      .select('id,book_id,title,price,order_index').eq('id', chapterId)
      .eq('published', true).is('removed_at', null).maybeSingle();
    if (error) return json({ error: 'Could not load chapter' }, 502);
    if (!chapter) return json({ error: 'Not found' }, 404);
    const { data: book, error: bookError } = await client.from('books')
      .select('id,title,author_id').eq('id', chapter.book_id).eq('published', true).is('deleted_at', null).maybeSingle();
    if (bookError) return json({ error: 'Could not load book' }, 502);
    if (!book) return json({ error: 'Not found' }, 404);
    let gate: 'none' | 'login' | 'purchase' = 'none';
    if (chapter.price > 0 && viewerId !== book.author_id) {
      if (!viewerId) gate = 'purchase';
      else {
        const purchase = await client.from('purchase_transactions').select('id')
          .eq('chapter_id', chapterId).eq('buyer_id', viewerId).maybeSingle();
        if (purchase.error) return json({ error: 'Could not verify access' }, 502);
        if (!purchase.data) gate = 'purchase';
      }
    }
    let content = '';
    if (gate !== 'purchase') {
      const result = await client.from('chapters').select('content').eq('id', chapterId)
        .eq('published', true).is('removed_at', null).maybeSingle();
      if (result.error) return json({ error: 'Could not load content' }, 502);
      if (!result.data) return json({ error: 'Not found' }, 404);
      content = result.data.content;
      if (!viewerId) {
        const preview = buildContentPreview(content);
        content = preview.visible;
        if (preview.truncated) gate = 'login';
      }
    }
    const siblings = await client.from('chapters').select('id').eq('book_id', book.id)
      .eq('published', true).is('removed_at', null).order('order_index');
    if (siblings.error) return json({ error: 'Could not load navigation' }, 502);
    const ordered = siblings.data ?? [];
    const index = ordered.findIndex(c => c.id === chapterId);
    return json({ id: chapter.id, bookId: book.id, title: chapter.title, bookTitle: book.title, content,
      price: chapter.price, gate, previousId: ordered[index - 1]?.id ?? null,
      nextId: index >= 0 ? ordered[index + 1]?.id ?? null : null });
  } catch {
    return json({ error: 'Reader service unavailable' }, 502);
  }
}
