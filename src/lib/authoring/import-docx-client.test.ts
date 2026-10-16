import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { importDocx } from "./import-docx-client";
let state: { visibilityState: string };
const fetcher = vi.fn();
const id = "71000000-0000-4000-8000-000000000001";
const response = (body: unknown, status = 200, headers = {}) => Response.json(body, { status, headers });
beforeEach(() => {
  vi.useFakeTimers(); fetcher.mockReset();
  state = { visibilityState: "visible" };
  vi.stubGlobal("document", state); vi.stubGlobal("navigator", { onLine: true }); vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("accepts the existing synchronous response while queue mode is disabled", async () => {
  fetcher.mockResolvedValue(response({ text: "legacy", headingChapters: [] }));
  const wait = vi.fn();
  expect((await importDocx(new File(["docx"], "a.docx"), new AbortController().signal, wait)).text).toBe("legacy");
  expect(wait).not.toHaveBeenCalled();
  expect(fetcher.mock.calls[0][1].body.get("async")).toBe("1");
});
it("waits for a queued result and does not poll a hidden tab", async () => {
  fetcher.mockResolvedValueOnce(response({ jobId: id }, 202)).mockResolvedValue(response({ status: "succeeded", text: "queued", headingChapters: [] }));
  state.visibilityState = "hidden";
  const result = importDocx(new File(["docx"], "a.docx"), new AbortController().signal, vi.fn());
  await vi.advanceTimersByTimeAsync(20000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  state.visibilityState = "visible";
  await vi.advanceTimersByTimeAsync(5000);
  expect((await result).text).toBe("queued");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("stops polling when the modal closes", async () => {
  fetcher.mockResolvedValue(response({ jobId: id }, 202));
  const controller = new AbortController();
  const result = importDocx(new File(["docx"], "a.docx"), controller.signal, vi.fn());
  const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0); controller.abort(); await assertion;
  await vi.advanceTimersByTimeAsync(60000); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("backs off rate-limited polling using Retry-After", async () => {
  fetcher.mockResolvedValueOnce(response({ jobId: id }, 202))
    .mockResolvedValueOnce(response({}, 429, { "Retry-After": "30" }))
    .mockResolvedValue(response({ status: "succeeded", text: "done" }));
  const result = importDocx(new File(["docx"], "a.docx"), new AbortController().signal, vi.fn());
  await vi.advanceTimersByTimeAsync(5000); expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(29999); expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1); expect((await result).text).toBe("done");
});
