import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { enqueueManuscript } from "./manuscript-queue";
const rpc = vi.fn(), upload = vi.fn(), remove = vi.fn(), maybeSingle = vi.fn(), update = vi.fn();
const chain = { eq: vi.fn(() => chain), select: vi.fn(() => chain), maybeSingle, then: (resolve: (v: unknown) => void) => Promise.resolve(resolve({ error: null })) };
const client = { rpc, from: () => ({ update }), storage: { from: () => ({ upload, remove }) } } as unknown as SupabaseClient<Database>;
beforeEach(() => {
  vi.clearAllMocks(); rpc.mockResolvedValue({ data: [{ created: true }], error: null });
  upload.mockResolvedValue({ error: null }); remove.mockResolvedValue({ error: null });
  update.mockReturnValue(chain); maybeSingle.mockResolvedValue({ data: { id: "id" }, error: null });
});
it("returns 202 only after durable reservation and upload/queue transition", async () => {
  const response = await enqueueManuscript(client, "owner", "id", new File(["docx"], "a.docx"));
  expect(response.status).toBe(202);
  expect(update).toHaveBeenCalledWith({ status: "queued" });
  expect(upload.mock.calls[0][0]).toBe("owner/id/input.docx");
});
it("reuses an existing job without overwriting its input", async () => {
  rpc.mockResolvedValue({ data: [{ created: false }], error: null });
  expect((await enqueueManuscript(client, "owner", "id", new File(["docx"], "a.docx"))).status).toBe(202);
  expect(upload).not.toHaveBeenCalled();
});
it("rejects backlog before uploading files", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "IMPORT_QUEUE_FULL" } });
  const response = await enqueueManuscript(client, "owner", "id", new File(["docx"], "a.docx"));
  expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
  expect(upload).not.toHaveBeenCalled();
});
it("marks failed uploads and attempts cleanup", async () => {
  upload.mockResolvedValue({ error: { message: "offline" } });
  expect((await enqueueManuscript(client, "owner", "id", new File(["docx"], "a.docx"))).status).toBe(503);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  expect(remove).toHaveBeenCalledWith(["owner/id/input.docx"]);
});
it("does not delete input after an ambiguous queue transition", async () => {
  maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "lost response" } }).mockResolvedValueOnce({ data: null, error: null });
  expect((await enqueueManuscript(client, "owner", "id", new File(["docx"], "a.docx"))).status).toBe(503);
  expect(remove).not.toHaveBeenCalled();
});
