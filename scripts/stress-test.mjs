import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

// Anonymous GETs only. Never follows redirects or sends account credentials.
const base = new URL(process.env.LOAD_TEST_URL || 'http://127.0.0.1:3100');
const paths = ['/', '/truyen', '/su-kien'];
const rates = (process.env.LOAD_TEST_RATES || '1,3,5,10').split(',').map(Number);
const duration = Number(process.env.LOAD_TEST_SECONDS || 20);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 128);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
    rates.some(r => !Number.isInteger(r) || r < 1 || r > 100) ||
    !Number.isInteger(duration) || duration < 5 || duration > 1800 ||
    !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 256) {
  throw new Error('Use rates 1..100, duration 5..1800 seconds, concurrency 1..256.');
}
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil(sorted.length * p) - 1]);
};
async function request(path) {
  const start = performance.now();
  const startedAt = new Date().toISOString();
  let status = 0, phase = 'headers', vercelId = null, ttfbMs = null;
  try {
    const response = await fetch(new URL(path, base), {
      redirect: 'manual', signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Vinh-Owner-Load-Test/1.0', Accept: 'text/html' },
    });
    status = response.status;
    vercelId = response.headers.get('x-vercel-id');
    ttfbMs = Math.round(performance.now() - start);
    phase = 'body';
    const body = await response.text();
    // Next can stream an error after sending HTTP 200.
    const streamedError = /"digest"\s*:\s*"[^"]+"/.test(body);
    return { path, startedAt, vercelId, ttfbMs, status: response.status, ms: performance.now() - start,
      ok: response.status === 200 && /text\/html/i.test(response.headers.get('content-type') || '') && body.includes('</html>') && !streamedError,
      bytes: Buffer.byteLength(body), cache: response.headers.get('x-vercel-cache'), streamedError };
  } catch (error) {
    return { path, startedAt, vercelId, ttfbMs, status, phase, ms: performance.now() - start,
      ok: false, error: error.name, causeCode: error.cause?.code ?? null };
  }
}
function summarize(rows) {
  const statuses = {}, cache = {};
  for (const row of rows) {
    statuses[row.status] = (statuses[row.status] || 0) + 1;
    if (row.cache) cache[row.cache] = (cache[row.cache] || 0) + 1;
  }
  return { requests: rows.length, successes: rows.filter(r => r.ok).length,
    errorPercent: rows.length ? +(100 * rows.filter(r => !r.ok).length / rows.length).toFixed(2) : null,
    p50Ms: percentile(rows.map(r => r.ms), .5), p95Ms: percentile(rows.map(r => r.ms), .95),
    maxMs: rows.length ? Math.round(Math.max(...rows.map(r => r.ms))) : null, statuses, cache };
}
const report = { startedAt: new Date().toISOString(), origin: base.origin,
  paths, durationSeconds: duration, rates, thresholds: { maxErrorPercent: 1, maxP95Ms: 2000 },
  concurrency,
  model: 'Fixed arrival rate; full HTML body, no JS/assets/auth; no redirects; no catch-up bursts', stages: [] };
const warmup = [];
for (const path of paths) warmup.push(await request(path));
report.warmup = warmup;
console.log('Warmup:', JSON.stringify(warmup));
if (warmup.some(r => !r.ok)) {
  report.stopReason = 'Baseline failed; no load sent.';
} else {
  for (const rate of rates) {
    const rows = [], pending = new Set();
    let skipped = 0, nextWindow = 30, lastWindowRow = 0, stop = false;
    const windows = [];
    const start = performance.now();
    for (let i = 0; i < rate * duration; i++) {
      const scheduled = start + i * 1000 / rate;
      await sleep(Math.max(0, scheduled - performance.now()));
      if ((performance.now() - start) / 1000 >= nextWindow) {
        const sample = summarize(rows.slice(lastWindowRow));
        windows.push({ seconds: nextWindow, ...sample });
        console.log('Window:', JSON.stringify({ targetRps: rate, seconds: nextWindow, inFlight: pending.size, skipped, ...sample }));
        lastWindowRow = rows.length;
        nextWindow += 30;
        if (sample.requests >= 20 && (sample.errorPercent > 1 || sample.p95Ms > 2000)) {
          stop = true;
          report.stopReason = 'Live 30-second quality window failed; stopped new arrivals.';
          break;
        }
      }
      // Drop late arrivals rather than producing an unintended catch-up burst.
      const dispatchLagMs = performance.now() - scheduled;
      if (pending.size >= concurrency || dispatchLagMs > 250) { skipped++; continue; }
      const work = request(paths[i % paths.length]).then(row => rows.push({ ...row, dispatchLagMs: Math.round(dispatchLagMs), completedAtSeconds: +((performance.now() - start) / 1000).toFixed(3) })).finally(() => pending.delete(work));
      pending.add(work);
    }
    const sendingSeconds = stop ? (performance.now() - start) / 1000 : duration;
    if (!stop) await sleep(Math.max(0, start + duration * 1000 - performance.now()));
    await Promise.all(pending);
    const elapsed = (performance.now() - start) / 1000;
    const summary = summarize(rows);
    const stage = { targetRps: rate, elapsedSeconds: +elapsed.toFixed(2), sendingSeconds: +sendingSeconds.toFixed(2), skipped, windows,
      plannedRequests: rate * duration, stoppedEarly: stop,
      dispatchLagP95Ms: percentile(rows.map(r => r.dispatchLagMs), .95),
      successfulRps: +(summary.successes / elapsed).toFixed(2), ...summary,
      routes: Object.fromEntries(paths.map(path => [path, summarize(rows.filter(r => r.path === path))])), rows };
    stage.passed = !stop && rows.length === rate * duration && summary.errorPercent <= 1 && summary.p95Ms <= 2000 && skipped === 0;
    report.stages.push(stage);
    console.log(JSON.stringify({ ...stage, rows: undefined }));
    if (!stage.passed) { report.stopReason = 'Stopped at first failed quality threshold.'; break; }
    await sleep(5000);
  }
}
report.finishedAt = new Date().toISOString();
await mkdir('.tmp/load-tests', { recursive: true });
const file = `.tmp/load-tests/${report.startedAt.replace(/[:.]/g, '-')}.json`;
await writeFile(file, JSON.stringify(report, null, 2));
console.log(`Report: ${file}`);
if (report.stopReason) console.log(report.stopReason);
