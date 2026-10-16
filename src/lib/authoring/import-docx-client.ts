import type { DetectedChapter } from "./split-chapters";

const delay = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
  const onAbort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
  signal.addEventListener("abort", onAbort, { once: true });
});

export async function importDocx(file: File, signal: AbortSignal, onWaiting: () => void) {
  const form = new FormData(); form.set("file", file); form.set("async", "1");
  const first = await fetch("/api/authoring/manuscripts/extract", {
    method: "POST", body: form, signal, headers: { "x-import-id": crypto.randomUUID() },
  });
  let data = await first.json().catch(() => null);
  signal.throwIfAborted();
  if (!first.ok) throw new Error(data?.error || "Không đọc được file này.");
  if (first.status === 202) {
    const jobId = data?.jobId;
    if (typeof jobId !== "string" || !/^[a-f\d-]{36}$/i.test(jobId)) throw new Error("Mã tác vụ không hợp lệ.");
    onWaiting();
    const deadline = Date.now() + 30 * 60_000;
    let wait = 5000;
    while (!signal.aborted) {
      await delay(wait, signal);
      if (Date.now() >= deadline) throw new Error("Tác vụ đang chờ quá lâu. Vui lòng thử lại sau.");
      if (document.visibilityState !== "visible" || navigator.onLine === false) continue;
      let response: Response;
      try { response = await fetch(`/api/authoring/manuscripts/jobs/${jobId}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), cache: "no-store" }); }
      catch (error) { if (signal.aborted) throw error; wait = Math.min(30_000, wait * 2); continue; }
      const state = await response.json().catch(() => null);
      if (response.status === 429 || response.status >= 500) {
        const seconds = Number(response.headers.get("retry-after") || 10);
        const retry = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 10_000;
        wait = Math.min(120_000, Math.max(wait * 2, retry)); continue;
      }
      if (!response.ok || state?.status === "failed") throw new Error(state?.error || "Không tải được kết quả nhập.");
      if (state?.status === "succeeded") { data = state; break; }
      wait = 10_000;
    }
  }
  signal.throwIfAborted();
  if (typeof data?.text !== "string") throw new Error("Không đọc được nội dung bản thảo.");
  return { text: data.text as string, headingChapters: (Array.isArray(data.headingChapters) ? data.headingChapters : []) as DetectedChapter[] };
}
