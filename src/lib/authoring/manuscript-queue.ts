import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const IMPORT_BUCKET = "manuscript-imports";
export const IMPORT_PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
export const IMPORT_JOB_ID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;

export async function enqueueManuscript(client: SupabaseClient<Database>, userId: string, jobId: string, file: File) {
  const { data, error } = await client.rpc("reserve_manuscript_import", { p_id: jobId, p_owner: userId });
  if (error || !data?.[0]) {
    const full = error?.message === "IMPORT_QUEUE_FULL" || error?.message === "IMPORT_OWNER_FULL";
    return Response.json({ error: full ? "Đang có nhiều bản thảo chờ xử lý. Vui lòng thử lại sau." : "Chưa tạo được tác vụ nhập bản thảo." }, {
      status: full ? 429 : 503, headers: { ...IMPORT_PRIVATE_HEADERS, "Retry-After": "60" },
    });
  }
  if (data[0].created) {
    const path = `${userId}/${jobId}/input.docx`;
    try {
      const uploaded = await client.storage.from(IMPORT_BUCKET).upload(path, file, { contentType: "application/octet-stream", upsert: false });
      if (uploaded.error) throw uploaded.error;
      const queued = await client.from("manuscript_import_jobs").update({ status: "queued" }).eq("id", jobId).eq("owner_id", userId).eq("status", "uploading").select("id").maybeSingle();
      if (queued.error || !queued.data) throw new Error("Queue transition failed");
    } catch {
      // Failed cleanup is retried by expiry GC; do not log manuscript data.
      const failed = await client.from("manuscript_import_jobs").update({ status: "failed", error_message: "Không lưu được file nhập." })
        .eq("id", jobId).eq("owner_id", userId).eq("status", "uploading").select("id").maybeSingle();
      // The queued update may have committed even if its HTTP response was lost.
      // Delete input only when we know this request transitioned uploading -> failed.
      if (!failed.error && failed.data) await client.storage.from(IMPORT_BUCKET).remove([path]).catch(() => undefined);
      return Response.json({ error: "Không lưu được bản thảo. Vui lòng thử lại." }, { status: 503, headers: IMPORT_PRIVATE_HEADERS });
    }
  }
  return Response.json({ jobId }, { status: 202, headers: { ...IMPORT_PRIVATE_HEADERS, "Retry-After": "10" } });
}
