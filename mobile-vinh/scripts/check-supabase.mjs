import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
try { loadEnvFile('.env.local'); } catch { /* CI can inject variables. */ }
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Missing public Supabase configuration. See .env.example.');
const client = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await client.from('books')
  .select('id,title,slug,synopsis,genre,view_count,created_at')
  .eq('published', true).is('deleted_at', null).order('view_count', { ascending: false })
  .limit(3).abortSignal(AbortSignal.timeout(15000));
if (error) { console.error('Supabase query failed:', error.code || error.message); process.exitCode = 1; }
else {
  console.log(`Supabase connected; ${data.length} published books returned (limit 3).`);
  if (data[0]) {
    const chapters = await client.from('chapters').select('id,title,price').eq('book_id', data[0].id)
      .eq('published', true).is('removed_at', null).order('order_index').limit(1)
      .abortSignal(AbortSignal.timeout(15000));
    if (chapters.error) { console.error('Chapter metadata query failed:', chapters.error.code); process.exitCode = 1; }
    else {
      console.log(`Chapter metadata readable: ${chapters.data.length} row(s).`);
      if (process.argv.includes('--reader') && chapters.data[0]) {
        const base = process.env.EXPO_PUBLIC_API_URL;
        if (!base) throw new Error('Missing EXPO_PUBLIC_API_URL.');
        const response = await fetch(`${base}/api/mobile/chapters/${chapters.data[0].id}`, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Reader API returned HTTP ${response.status}`);
        const body = await response.json();
        if (chapters.data[0].price > 0 && (body.gate !== 'purchase' || body.content !== '')) throw new Error('Paid content gate failed');
        console.log(`Reader API connected; gate=${body.gate}; content characters=${body.content.length}.`);
      }
    }
  }
}
