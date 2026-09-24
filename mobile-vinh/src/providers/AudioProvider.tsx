import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioStatus } from 'expo-audio';
import { supabase } from '../services/supabase';
import type { AudioTrack } from '../services/audio';

type AudioContextValue = {
  track: AudioTrack | null; queue: AudioTrack[]; status: AudioStatus; loading: boolean;
  error: string; sleepAt: number | null;
  play: (track: AudioTrack, queue?: AudioTrack[]) => Promise<void>;
  toggle: () => Promise<void>; seek: (seconds: number) => Promise<void>;
  rate: (value: number) => void; sleep: (minutes: number) => void; stop: () => void;
};
const AudioContext = createContext<AudioContextValue | null>(null);
export const useAudio = () => {
  const value = useContext(AudioContext);
  if (!value) throw new Error('AudioProvider is missing');
  return value;
};

export function AudioProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const [track, setTrack] = useState<AudioTrack | null>(null);
  const [queue, setQueue] = useState<AudioTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  const generation = useRef(0);
  const cancelLoad = useRef<(() => void) | null>(null);
  const owner = useRef<string | null>(null);
  const deadline = useRef<number | null>(null);
  const mounted = useRef(true);

  function stop() {
    generation.current++; cancelLoad.current?.(); cancelLoad.current = null;
    player.pause(); player.replace(null);
    if (Platform.OS !== 'web') player.clearLockScreenControls();
    deadline.current = null; owner.current = null;
    setSleepAt(null); setTrack(null); setQueue([]); setLoading(false); setError('');
  }
  useEffect(() => {
    mounted.current = true;
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (owner.current && session?.user.id !== owner.current) {
        generation.current++; cancelLoad.current?.();
        player.pause(); player.replace(null);
        if (Platform.OS !== 'web') player.clearLockScreenControls();
        owner.current = null; deadline.current = null;
        setTrack(null); setQueue([]); setLoading(false); setSleepAt(null); setError('');
      }
    }).data.subscription;
    return () => { mounted.current = false; cancelLoad.current?.(); subscription?.unsubscribe(); };
  }, [player]);
  useEffect(() => {
    const check = () => {
      if (deadline.current !== null && Date.now() >= deadline.current) {
        player.pause(); deadline.current = null; setSleepAt(null);
      }
    };
    const timer = setInterval(check, 1000);
    const listener = AppState.addEventListener('change', check);
    const progress = player.addListener('playbackStatusUpdate', check);
    return () => { clearInterval(timer); listener.remove(); progress.remove(); };
  }, [player]);

  async function play(next: AudioTrack, playlist: AudioTrack[] = [next]) {
    const operation = ++generation.current;
    cancelLoad.current?.();
    setError(''); setLoading(true);
    player.pause();
    try {
      const auth = await supabase?.auth.getSession();
      if (operation !== generation.current || !mounted.current) return;
      if (!auth?.data.session || auth.error) throw new Error('Vui lòng đăng nhập để nghe audio.');
      owner.current = auth.data.session.user.id;
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix', allowsRecording: false });
      if (operation !== generation.current || !mounted.current) return;
      setTrack(next); setQueue(playlist);
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = (failure?: Error) => {
          if (done) return; done = true; clearTimeout(timeout); listener.remove();
          if (operation === generation.current) cancelLoad.current = null;
          if (failure) reject(failure); else resolve();
        };
        const listener = player.addListener('playbackStatusUpdate', state => {
          if (state.error) finish(new Error('Không phát được tệp audio. Vui lòng thử lại.'));
          else if (state.isLoaded) finish();
        });
        const timeout = setTimeout(() => finish(new Error('Tải audio quá lâu. Kiểm tra mạng và thử lại.')), 20000);
        cancelLoad.current = () => finish(new Error('Đã đổi bản thu.'));
        try { player.replace({ uri: next.audioUrl }); } catch { finish(new Error('Không mở được nguồn audio.')); }
      });
      if (operation !== generation.current || !mounted.current) return;
      if (Platform.OS !== 'web') player.setActiveForLockScreen(true,
        { title: next.title, artist: next.narratorName, albumTitle: 'Vịnh · Audio Drama' },
        { showSeekBackward: true, showSeekForward: true });
      player.play();
    } catch (e) {
      if (operation === generation.current && mounted.current) setError(e instanceof Error ? e.message : 'Không phát được audio.');
    } finally { if (operation === generation.current && mounted.current) setLoading(false); }
  }
  async function toggle() {
    if (loading || !track) return;
    if (error || status.error || !status.isLoaded) { await play(track, queue); return; }
    try {
      if (player.playing) player.pause();
      else {
        if (deadline.current && Date.now() >= deadline.current) { deadline.current = null; setSleepAt(null); }
        if (status.duration > 0 && player.currentTime >= status.duration - 0.25) await player.seekTo(0);
        player.play();
      }
    } catch { setError('Không điều khiển được audio. Vui lòng mở lại bản thu.'); }
  }
  async function seek(seconds: number) {
    if (!status.isLoaded || !Number.isFinite(seconds)) return;
    try { await player.seekTo(Math.max(0, Math.min(seconds, status.duration))); }
    catch { setError('Không tua được audio. Vui lòng thử lại.'); }
  }
  function rate(value: number) {
    if (![1, 1.25, 1.5, 2].includes(value) || !status.isLoaded) return;
    try { player.setPlaybackRate(value); } catch { setError('Không đổi được tốc độ phát.'); }
  }
  function sleep(minutes: number) {
    deadline.current = minutes > 0 ? Date.now() + minutes * 60000 : null;
    setSleepAt(deadline.current);
  }
  return <AudioContext.Provider value={{ track, queue, status, loading, error: error || (status.error ? 'Không phát được tệp audio. Thử mở lại bản thu.' : ''),
    sleepAt, play, toggle, seek, rate, sleep, stop }}>{children}</AudioContext.Provider>;
}
