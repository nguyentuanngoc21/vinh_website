/**
 * Poll sau khi request trước hoàn tất, không chồng lấn. Tạm ngừng khi tab
 * ẩn/offline; lỗi/rejected hoặc false làm giãn nhịp tới tối đa 120 giây.
 * Callback phải truyền signal vào fetch và không cập nhật state khi signal
 * đã abort. Cleanup hủy request; timeout mỗi lần là 15 giây.
 */
export function startVisiblePolling(fn: (signal: AbortSignal) => unknown, ms: number): () => void {
  let stopped = false;
  let running = false;
  let failures = 0;
  let nextAttempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const available = () => document.visibilityState === "visible" && navigator.onLine !== false;
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped && available()) timer = setTimeout(tick, Math.max(0, nextAttempt - Date.now()));
  };
  const tick = async () => {
    if (stopped || running || !available()) return;
    if (Date.now() < nextAttempt) { schedule(); return; }
    running = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 15_000);
    try {
      const result = await fn(controller.signal);
      failures = result === false ? failures + 1 : 0;
    } catch {
      failures++;
    } finally {
      clearTimeout(timeout);
      running = false;
      nextAttempt = Date.now() + Math.min(120_000, ms * 2 ** Math.min(failures, 5));
      schedule();
    }
  };
  const onResume = () => {
    if (!available()) { clearTimeout(timer); return; }
    // A successful poll may refresh immediately on return. Failed polls retain backoff.
    if (failures === 0 && !running) nextAttempt = 0;
    void tick();
  };
  void tick();
  document.addEventListener("visibilitychange", onResume);
  window.addEventListener("online", onResume);
  window.addEventListener("offline", onResume);
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    document.removeEventListener("visibilitychange", onResume);
    window.removeEventListener("online", onResume);
    window.removeEventListener("offline", onResume);
  };
}
