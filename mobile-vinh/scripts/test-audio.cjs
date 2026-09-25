/* global __dirname */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { setImmediate: tick } = require('node:timers/promises');
const ts = require('typescript');
function load(file, imports) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)(name => imports[name], exports);
  return exports;
}
test('audio duration handles unknown, zero, hour boundary and invalid values', () => {
  const { formatAudioTime } = load('services/audio.ts', {});
  assert.equal(formatAudioTime(null), '—'); assert.equal(formatAudioTime(NaN), '—');
  assert.equal(formatAudioTime(0), '0:00'); assert.equal(formatAudioTime(3599), '59:59');
  assert.equal(formatAudioTime(3600), '1:00:00'); assert.equal(formatAudioTime(61.9), '1:01');
});
test('empty database shows empty catalog instead of sample tracks', async () => {
  const query = { select() { return query; }, order() { return query; }, limit() { return query; },
    abortSignal() { return Promise.resolve({ data: [], error: null }); } };
  const { getAudioCatalog } = load('services/audio.ts', { './supabase': { requireSupabase: () => ({ from: () => query }) } });
  assert.deepEqual(await getAudioCatalog(), []);
});
function playerFixture(user = 'alice', savedPositions = {}) {
  const saves = []; const plays = [];
  let cursor = 0; const cells = []; const effects = []; const cleanups = []; const listeners = new Set();
  let session = user ? { user: { id: user } } : null; let authChanged;
  const calls = []; let source = null;
  const player = {
    currentTime: 0, playing: false, isLoaded: true, duration: 100,
    pause() { this.playing = false; calls.push(['pause']); },
    play() { this.playing = true; calls.push(['play', source]); },
    replace(value) { source = value?.uri ?? null; calls.push(['replace', source]); },
    setActiveForLockScreen(active, meta) { calls.push(['lock', active, meta]); },
    clearLockScreenControls() { calls.push(['clear']); },
    setPlaybackRate(rate) { calls.push(['rate', rate]); },
    async seekTo(seconds) { this.currentTime = seconds; calls.push(['seek', seconds]); },
    addListener(_event, callback) { listeners.add(callback); return { remove: () => listeners.delete(callback) }; },
  };
  const status = { duration: 100, currentTime: 0, isLoaded: true, playing: false, error: null };
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useContext: () => null,
    useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = value; return [cells[index], next => { cells[index] = next; }]; },
    useRef(value) { const index = cursor++; if (!(index in cells)) cells[index] = { current: value }; return cells[index]; },
    useEffect(effect) { const index = cursor++; if (!(index in cells)) { cells[index] = true; effects.push(effect); } },
    useCallback(fn) { cursor++; return fn; },
  };
  const { AudioProvider } = load('providers/AudioProvider.tsx', {
    react, 'react/jsx-runtime': { jsx: (_type, props) => props },
    'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener: () => ({ remove() {} }) } },
    'expo-audio': { useAudioPlayer: () => player, useAudioPlayerStatus: () => status, setAudioModeAsync: async () => undefined },
    '../services/supabase': { supabase: { auth: {
      async getSession() { return { data: { session }, error: null }; },
      onAuthStateChange(callback) { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    } } },
    '../services/audio': {
      getListeningProgress: async () => Object.entries(savedPositions).map(([audioId, positionSeconds]) => ({ audioId, positionSeconds, updatedAt: 't' })),
      saveListeningProgress: async (userId, audioId, seconds) => { saves.push([userId, audioId, seconds]); },
      recordPlay: async (id) => { plays.push(id); },
    },
  });
  function render() { cursor = 0; const value = AudioProvider({ children: null }).value; while (effects.length) cleanups.push(effects.shift()()); return value; }
  return { render, calls, player, status, saves, plays, emit: event => { for (const callback of [...listeners]) callback(event); },
    signOut() { session = null; authChanged('SIGNED_OUT', null); },
    close() { for (const cleanup of cleanups) cleanup?.(); } };
}
const track = id => ({ id, title: id, narratorName: 'Narrator', audioUrl: 'https://audio.test/' + id });
test('guest cannot load a full audio source', async () => {
  const f = playerFixture(null);
  try { await f.render().play(track('a')); assert.ok(f.render().error.includes('đăng nhập')); assert.equal(f.calls.some(c => c[0] === 'replace'), false); }
  finally { f.close(); }
});
test('rapid source changes only play the latest selection; logout clears playback', async () => {
  const f = playerFixture();
  try {
    const first = f.render().play(track('a')); await tick();
    const second = f.render().play(track('b')); await tick();
    f.emit({ isLoaded: true }); await Promise.all([first, second]);
    assert.deepEqual(f.calls.filter(c => c[0] === 'play'), [['play', 'https://audio.test/b']]);
    assert.equal(f.render().track.id, 'b');
    f.signOut(); assert.equal(f.render().track, null); assert.equal(f.player.playing, false);
  } finally { f.close(); }
});
test('source load failure is visible; seek is bounded and unsupported rates ignored', async () => {
  const f = playerFixture();
  try {
    const pending = f.render().play(track('broken')); await tick(); f.emit({ error: '404' }); await pending;
    assert.ok(f.render().error); assert.equal(f.calls.some(c => c[0] === 'play'), false);
    await f.render().seek(-30); await f.render().seek(999); f.render().rate(5);
    assert.deepEqual(f.calls.filter(c => c[0] === 'seek'), [['seek', 0], ['seek', 100]]);
    assert.equal(f.calls.some(c => c[0] === 'rate'), false);
  } finally { f.close(); }
});
test('resumes the saved position, counts one play per track and saves on pause', async () => {
  const fixture = playerFixture('alice', { a: 42, b: 99 });
  const audio = fixture.render();
  const loading = audio.play(track('a'));
  await new Promise(r => setTimeout(r, 0));
  fixture.emit({ isLoaded: true });
  await loading;
  assert.ok(fixture.calls.some(c => c[0] === 'seek' && c[1] === 42), 'resumed at 42s');
  assert.deepEqual(fixture.plays, ['a']);
  // Near the end (99 of 100 s): start over instead of resuming.
  const again = audio.play(track('b'));
  await new Promise(r => setTimeout(r, 0));
  fixture.emit({ isLoaded: true });
  await again;
  assert.ok(!fixture.calls.some(c => c[0] === 'seek' && c[1] === 99));
  fixture.player.currentTime = 12.5;
  fixture.emit({ isLoaded: true, playing: true });
  fixture.emit({ isLoaded: true, playing: false });
  assert.deepEqual(fixture.saves.at(-1), ['alice', 'b', 12.5]);
  const replay = audio.play(track('a'));
  await new Promise(r => setTimeout(r, 0));
  fixture.emit({ isLoaded: true });
  await replay;
  assert.deepEqual(fixture.plays, ['a', 'b'], 'a is not counted twice in one session');
  fixture.close();
});
