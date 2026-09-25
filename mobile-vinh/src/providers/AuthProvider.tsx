import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

const AuthContext = createContext<{ session: Session | null; loading: boolean; error: string }>({ session: null, loading: true, error: '' });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ session: Session | null; loading: boolean; error: string }>({ session: null, loading: !!supabase, error: '' });
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let changed = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      changed = true;
      if (active) setState({ session, loading: false, error: '' });
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && !changed) setState({ session: data.session, loading: false,
        error: error ? 'Không khôi phục được phiên. Vui lòng đăng nhập lại.' : '' });
    }).catch(() => {
      if (active) setState({ session: null, loading: false, error: 'Không đọc được phiên đăng nhập trên thiết bị.' });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
