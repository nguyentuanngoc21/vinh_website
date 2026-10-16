import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { IMPORT_BUCKET, IMPORT_JOB_ID, IMPORT_PRIVATE_HEADERS } from "@/lib/authoring/manuscript-queue";
import { consumeRateLimits, rateLimitedResponse } from "@/lib/rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { userId, admin } = await getUserContext(request);
    if (!userId) return Response.json({ error: "Vui lòng đăng nhập." }, { status: 401, headers: IMPORT_PRIVATE_HEADERS });
    const { jobId } = await params;
    if (!IMPORT_JOB_ID.test(jobId)) return Response.json({}, { status: 404, headers: IMPORT_PRIVATE_HEADERS });
    const budget = consumeRateLimits([{ key: `import-status:${userId}`, limit: 30, windowMs: 60_000 }]);
    if (!budget.ok) return rateLimitedResponse("Vui lòng chờ trước khi tải lại trạng thái.", budget.retryAfterSec);
    const client = admin();
    const { data: job, error } = await client.from("manuscript_import_jobs")
      .select("id,status,output_path,expires_at,error_message").eq("id", jobId).eq("owner_id", userId).maybeSingle();
    if (error) throw error;
    if (!job) return Response.json({}, { status: 404, headers: IMPORT_PRIVATE_HEADERS });
    if (new Date(job.expires_at).getTime() <= Date.now()) return Response.json({ error: "Kết quả đã hết hạn. Vui lòng chọn lại file." }, { status: 410, headers: IMPORT_PRIVATE_HEADERS });
    if (job.status === "succeeded") {
      if (!job.output_path) throw new Error("Missing result");
      const { data: file, error: downloadError } = await client.storage.from(IMPORT_BUCKET).download(job.output_path);
      if (downloadError || !file || file.size > 2 * 1024 * 1024) throw new Error("Result unavailable");
      return Response.json({ status: job.status, ...JSON.parse(await file.text()) }, { headers: IMPORT_PRIVATE_HEADERS });
    }
    return Response.json({ status: job.status, error: job.status === "failed" ? job.error_message : undefined }, {
      headers: { ...IMPORT_PRIVATE_HEADERS, "Retry-After": "10" },
    });
  } catch (error) { return requestError(error); }
}
