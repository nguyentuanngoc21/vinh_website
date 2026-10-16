import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { IMPORT_BUCKET } from "./manuscript-queue";
import { extractDocx, InvalidDocxError } from "./docx-extraction";

export async function cleanExpiredImports(client: SupabaseClient<Database>) {
  const { data: expired, error } = await client.from("manuscript_import_jobs")
    .select("id,owner_id").lte("expires_at", new Date().toISOString()).limit(10);
  if (error) throw error;
  for (const job of expired ?? []) {
    const folder = `${job.owner_id}/${job.id}`;
    const { data: objects, error: listError } = await client.storage.from(IMPORT_BUCKET).list(folder, { limit: 100 });
    if (listError) throw listError;
    const paths = (objects ?? []).map(object => `${folder}/${object.name}`);
    if (paths.length) {
      const removed = await client.storage.from(IMPORT_BUCKET).remove(paths);
      if (removed.error) throw removed.error;
    }
    const deleted = await client.from("manuscript_import_jobs").delete().eq("id", job.id).lte("expires_at", new Date().toISOString());
    if (deleted.error) throw deleted.error;
  }
  return expired?.length ?? 0;
}

export async function processOneManuscript(client: SupabaseClient<Database>) {
  const { data, error } = await client.rpc("claim_manuscript_import", {});
  if (error) throw error;
  const job = data?.[0];
  if (!job?.lease_token) return { processed: 0 };
  const output = `${job.owner_id}/${job.id}/result-${job.lease_token}.json`;
  try {
    const input = await client.storage.from(IMPORT_BUCKET).download(job.input_path);
    if (input.error || !input.data) throw new Error("Input unavailable");
    if (input.data.size > 4 * 1024 * 1024) throw new InvalidDocxError("Input too large");
    const result = await extractDocx(Buffer.from(await input.data.arrayBuffer()));
    const saved = await client.storage.from(IMPORT_BUCKET).upload(output, JSON.stringify(result), { contentType: "application/json", upsert: false });
    if (saved.error) throw saved.error;
    const finished = await client.rpc("finish_manuscript_import", {
      p_id: job.id, p_token: job.lease_token, p_outcome: "succeeded", p_output: output,
    });
    if (finished.error) throw finished.error;
    if (!finished.data) await client.storage.from(IMPORT_BUCKET).remove([output]);
    return { processed: 1, committed: finished.data };
  } catch (failure) {
    // A failed HTTP response may hide a committed finish RPC. Keep output for GC,
    // rather than delete a result that the database may already reference.
    const finished = await client.rpc("finish_manuscript_import", {
      p_id: job.id, p_token: job.lease_token, p_outcome: failure instanceof InvalidDocxError ? "failed" : "retry",
    });
    if (finished.error) throw finished.error;
    return { processed: 1, retryable: !(failure instanceof InvalidDocxError) };
  }
}
