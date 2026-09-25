import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioStatus } from 'expo-audio';
import { supabase } from '../services/supabase';
import { getListeningProgress, recordPlay, saveListeningProgress, type AudioTrack } from '../services/audio';

const SAVE_EVERY_MS = 8000; // same cadence as the web player (now-playing-context.tsx)
const RESUME_MIN_SECONDS = 5;

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
  // Listening position sync with the web (audio_progress) and one play count per track per session.
  const current = useRef<AudioTrack | null>(null);
  const lastSave = useRef(0);
  const wasPlaying = useRef(false);
  const counted = useRef(new Set<string>());
  const persist = useCallback(() => {
    const listening = current.current;
    if (!listening || !owner.current || !player.isLoaded) return;
    lastSave.current = Date.now();
    void saveListeningProgress(owner.current, listening.id, player.currentTime).catch(() => undefined);
  }, [player]);

  function stop() {
    persist(); current.current = null;
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
        // Never save the previous account's position under the new one.
        current.current = null;
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
    const listener = AppState.addEventListener('change', state => { check(); if (state !== 'active') persist(); });
    const progress = player.addListener('playbackStatusUpdate', state => {
      check();
      // Save while playing (throttled) and whenever playback stops (pause, end, interruption).
      if (state.playing && Date.now() - lastSave.current >= SAVE_EVERY_MS) persist();
      else if (wasPlaying.current && !state.playing) persist();
      wasPlaying.current = state.playing;
    });
    return () => { clearInterval(timer); listener.remove(); progress.remove(); };
  }, [player, persist]);

  async function play(next: AudioTrack, playlist: AudioTrack[] = [next]) {
    if (current.current && current.current.id !== next.id) persist();
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
      setTrack(next); setQueue(playlist); current.current = next;
      const saved = getListeningProgress(auth.data.session.user.id).then(list => list.find(p => p.audioId === next.id)?.positionSeconds ?? 0).catch(() => 0);
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
      // Resume where the listener stopped (on web or mobile), unless it was at the very end.
      const position = await saved;
      if (operation !== generation.current || !mounted.current) return;
      const duration = player.duration;
      if (position > RESUME_MIN_SECONDS && (!duration || position < duration - RESUME_MIN_SECONDS)) await player.seekTo(position).catch(() => undefined);
      if (!counted.current.has(next.id)) { counted.current.add(next.id); void recordPlay(next.id); }
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
