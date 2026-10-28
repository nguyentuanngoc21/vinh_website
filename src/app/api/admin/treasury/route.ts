import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { parseBankImport, parseLink, parseSnapshot } from "@/lib/admin/treasury-input";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Cần dữ liệu JSON." }, { status: 415 });
  const client = createServiceRoleClient();
  const actor = await getAuthedAdminId(client);
  if (!actor) return Response.json({ error: "Bạn không có quyền quản lý ngân quỹ." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 500000) return Response.json({ error: "Dữ liệu quá lớn." }, { status: 413 });
  const raw = await request.text();
  if (raw.length > 500000) return Response.json({ error: "Dữ liệu quá lớn." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return Response.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 }); }

  // Parse separately: database failures must not be reported as invalid user input.
  let input;
  try {
    if (body.action === "snapshot") input = { action: "snapshot" as const, value: parseSnapshot(body) };
    else if (body.action === "import") input = { action: "import" as const, value: parseBankImport(body) };
    else if (body.action === "link") input = { action: "link" as const, value: parseLink(body) };
    else throw new Error("Thao tác không hợp lệ.");
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }

  try {
    if (input.action === "snapshot") {
      const { error } = await client.from("treasury_snapshots").insert({ ...input.value, created_by: actor });
      if (error?.code === "23505") return Response.json({ error: "Bản xác nhận này đã được lưu. Hãy tải lại trang." }, { status: 409 });
      if (error) throw error;
      return Response.json({ message: "Đã lưu bản xác nhận số dư." });
    }
    if (input.action === "link") {
      const { error } = await client.from("treasury_reconciliation_links").insert({ ...input.value, created_by: actor });
      if (error?.code === "23503") return Response.json({ error: "Không tìm thấy giao dịch sao kê." }, { status: 404 });
      if (error) throw error;
      return Response.json({ message: "Đã lưu liên kết và lịch sử thay đổi." });
    }
    const { data, error } = await client.rpc("admin_import_bank_entries", {
      p_source: input.value.source, p_entries: input.value.entries, p_actor: actor,
    });
    if (error?.hint === "bank_entry_conflict") return Response.json({ error: "Mã ngân hàng đã tồn tại với nội dung khác. Không có dòng nào được nhập; kiểm tra tệp gốc." }, { status: 409 });
    if (error) throw error;
    return Response.json({ message: `Đã nhập ${data} dòng mới; bỏ qua ${input.value.entries.length - (data ?? 0)} dòng đã có.` });
  } catch (error) {
    console.error("[admin/treasury]", error);
    return Response.json({ error: "Không lưu được dữ liệu ngân quỹ. Vui lòng thử lại." }, { status: 500 });
  }
}
