import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { secureStorage } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient<Database>(url, key, {
  auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true,
    detectSessionInUrl: false },
}) : null;

export function requireSupabase() {
  if (!supabase) throw new Error('Chưa cấu hình kết nối. Điền Supabase URL và publishable key trong .env.local.');
  return supabase;
}
