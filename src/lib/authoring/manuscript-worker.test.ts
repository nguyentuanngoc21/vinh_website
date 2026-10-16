import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
const { extract } = vi.hoisted(() => ({ extract: vi.fn() }));
vi.mock("./docx-extraction", () => ({ extractDocx: extract, InvalidDocxError: class extends Error {} }));
import { processOneManuscript, cleanExpiredImports } from "./manuscript-worker";
import { InvalidDocxError } from "./docx-extraction";
const rpc = vi.fn(), download = vi.fn(), upload = vi.fn(), remove = vi.fn();
const client = { rpc, storage: { from: () => ({ download, upload, remove }) } } as unknown as SupabaseClient<Database>;
const job = { id: "job", owner_id: "owner", input_path: "owner/job/input.docx", lease_token: "lease" };
beforeEach(() => {
  vi.clearAllMocks(); rpc.mockReset();
  rpc.mockResolvedValueOnce({ data: [job], error: null }).mockResolvedValue({ data: true, error: null });
  download.mockResolvedValue({ data: new Blob(["docx"]), error: null });
  extract.mockResolvedValue({ text: "text", headingChapters: [] });
  upload.mockResolvedValue({ error: null }); remove.mockResolvedValue({ error: null });
});

describe("expired manuscript cleanup", () => {
  function cleanupClient(removeError: unknown = null) {
    const deleteRows = vi.fn(() => ({ eq: () => ({ lte: async () => ({ error: null }) }) }));
    const deleteFiles = vi.fn(async () => ({ error: removeError }));
    const instance = { from: () => ({
      select: () => ({ lte: () => ({ limit: async () => ({ data: [{ id: "job", owner_id: "owner" }], error: null }) }) }),
      delete: deleteRows,
    }), storage: { from: () => ({ list: async () => ({ data: [{ name: "input.docx" }, { name: "result-token.json" }], error: null }), remove: deleteFiles }) } } as unknown as SupabaseClient<Database>;
    return { instance, deleteRows, deleteFiles };
  }
  it("removes private input/results before deleting cleanup metadata", async () => {
    const { instance, deleteRows, deleteFiles } = cleanupClient();
    expect(await cleanExpiredImports(instance)).toBe(1);
    expect(deleteFiles).toHaveBeenCalledWith(["owner/job/input.docx", "owner/job/result-token.json"]);
    expect(deleteRows).toHaveBeenCalledOnce();
  });
  it("retains metadata to retry when storage deletion fails", async () => {
    const { instance, deleteRows } = cleanupClient({ message: "offline" });
    await expect(cleanExpiredImports(instance)).rejects.toBeTruthy();
    expect(deleteRows).not.toHaveBeenCalled();
  });
});
describe("manuscript worker fencing", () => {
  it("stores output under lease-specific path before fenced commit", async () => {
    expect(await processOneManuscript(client)).toEqual({ processed: 1, committed: true });
    expect(rpc).toHaveBeenLastCalledWith("finish_manuscript_import", {
      p_id: "job", p_token: "lease", p_outcome: "succeeded", p_output: "owner/job/result-lease.json",
    });
  });
  it("removes an uncommitted stale lease result", async () => {
    rpc.mockReset().mockResolvedValueOnce({ data: [job] }).mockResolvedValue({ data: false });
    await processOneManuscript(client);
    expect(remove).toHaveBeenCalledWith(["owner/job/result-lease.json"]);
  });
  it("retains output on ambiguous commit errors rather than deleting a possibly committed result", async () => {
    rpc.mockReset().mockResolvedValueOnce({ data: [job] }).mockResolvedValueOnce({ error: { message: "network" } }).mockResolvedValue({ data: false });
    await processOneManuscript(client);
    expect(remove).not.toHaveBeenCalled();
  });
  it("fails invalid documents without retries", async () => {
    extract.mockRejectedValue(new InvalidDocxError("bad"));
    await processOneManuscript(client);
    expect(rpc).toHaveBeenLastCalledWith("finish_manuscript_import", { p_id: "job", p_token: "lease", p_outcome: "failed" });
    expect(upload).not.toHaveBeenCalled();
  });
  it("retries transient download errors", async () => {
    download.mockResolvedValue({ data: null, error: { message: "offline" } });
    await processOneManuscript(client);
    expect(rpc).toHaveBeenLastCalledWith("finish_manuscript_import", { p_id: "job", p_token: "lease", p_outcome: "retry" });
  });
  it("does no parsing when another worker owns the slot", async () => {
    rpc.mockReset().mockResolvedValue({ data: [] });
    expect(await processOneManuscript(client)).toEqual({ processed: 0 });
    expect(download).not.toHaveBeenCalled();
  });
});
