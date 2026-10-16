import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startVisiblePolling } from "./visible-polling";

let doc: EventTarget & { visibilityState: string };
let win: EventTarget;
let network: { onLine: boolean };
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  win = new EventTarget();
  network = { onLine: true };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", network);
});
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("visible polling", () => {
  it("does not overlap a slow request, even on visibility/online events", async () => {
    let resolve!: () => void;
    const fn = vi.fn(() => new Promise<void>(r => { resolve = r; }));
    stop = startVisiblePolling(fn, 1000);
    await vi.advanceTimersByTimeAsync(4000);
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("online"));
    expect(fn).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("suspends hidden/offline requests and refreshes once on return", async () => {
    doc.visibilityState = "hidden";
    const fn = vi.fn(async () => true);
    stop = startVisiblePolling(fn, 1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    network.onLine = false;
    win.dispatchEvent(new Event("offline"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(1);
    network.onLine = true;
    win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("backs off false/rejected results, retains delay on focus, and resets after success", async () => {
    const fn = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("network")).mockResolvedValue(true);
    stop = startVisiblePolling(fn, 1000);
    await vi.advanceTimersByTimeAsync(0);
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(4);
  });
  it("aborts in-flight work and prevents restart after cleanup", async () => {
    let active!: AbortSignal;
    const fn = vi.fn((signal: AbortSignal) => new Promise<void>(resolve => {
      active = signal;
      signal.addEventListener("abort", () => resolve());
    }));
    stop = startVisiblePolling(fn, 1000);
    stop();
    expect(active.aborted).toBe(true);
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("aborts a hung fetch after 15 seconds and retries with backoff", async () => {
    const fn = vi.fn((signal: AbortSignal) => new Promise<void>((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    stop = startVisiblePolling(fn, 1000);
    await vi.advanceTimersByTimeAsync(15000);
    expect(fn.mock.calls[0][0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("caps repeated-failure backoff at two minutes", async () => {
    const fn = vi.fn(async () => false);
    stop = startVisiblePolling(fn, 30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
