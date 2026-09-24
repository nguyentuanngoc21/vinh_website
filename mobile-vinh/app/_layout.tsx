import '../global.css';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../src/services/supabase';
import { AuthProvider } from '../src/providers/AuthProvider';
import { AudioProvider } from '../src/providers/AudioProvider';
export { ErrorBoundary } from 'expo-router';
export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web' || !supabase) return;
    const sync = (state: string) => {
      if (state === 'active') supabase?.auth.startAutoRefresh();
      else supabase?.auth.stopAutoRefresh();
    };
    sync(AppState.currentState);
    const subscription = AppState.addEventListener('change', sync);
    return () => { subscription.remove(); supabase?.auth.stopAutoRefresh(); };
  }, []);
  return <AuthProvider><AudioProvider><Stack screenOptions={{ headerShown: false }} /></AudioProvider></AuthProvider>;
}
