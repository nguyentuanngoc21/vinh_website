import { useEffect, useState } from 'react';
import { secureStorage } from '../services/storage';
export type Settings = { theme: 'light' | 'dark' | 'sepia'; font: 'sans' | 'serif'; size: number; spacing: number };
const defaults: Settings = { theme: 'sepia', font: 'serif', size: 20, spacing: 1.8 };
export const themes = {
  light: { background: '#ffffff', text: '#242424', muted: '#606060', panel: '#f2f3f4' },
  dark: { background: '#141e24', text: '#e7e4dc', muted: '#b0bdc4', panel: '#25333c' },
  sepia: { background: '#fbf7ec', text: '#443a2e', muted: '#786853', panel: '#ece3d1' },
};
// Serialize writes so rapidly tapped controls cannot persist an older value last.
let writes = Promise.resolve();
export function useReaderSettings() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    let active = true;
    secureStorage.getItem('vinh.reader.settings').then(raw => {
      if (!active || !raw) return;
      const value = JSON.parse(raw);
      setSettings({
        theme: ['light', 'dark', 'sepia'].includes(value.theme) ? value.theme : defaults.theme,
        font: value.font === 'sans' ? 'sans' : 'serif',
        size: typeof value.size === 'number' ? Math.min(32, Math.max(14, value.size)) : defaults.size,
        spacing: typeof value.spacing === 'number' ? Math.min(2.2, Math.max(1.4, value.spacing)) : defaults.spacing,
      });
    }).catch(() => { if (active) setStorageError(true); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    writes = writes.then(() => secureStorage.setItem('vinh.reader.settings', JSON.stringify(settings)))
      .catch(() => { if (active) setStorageError(true); });
    return () => { active = false; };
  }, [settings, ready]);
  return { settings, setSettings, ready, storageError };
}
