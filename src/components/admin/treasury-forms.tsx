"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CSV_HEADER, parseBankImport } from "@/lib/admin/treasury-input";
import { formatVnd } from "@/lib/format-currency";

const field = "w-full min-w-0 rounded-lg border border-cream-border bg-surface px-3 py-2 text-sm";
const button = "rounded-lg bg-brand-ink px-4 py-2 text-sm text-white disabled:opacity-50";
function useTreasurySave() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function save(body: Record<string, unknown>) {
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/treasury", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không lưu được dữ liệu.");
      setMessage(result.message); router.refresh(); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Lỗi kết nối."); return false; }
    finally { setPending(false); }
  }
  return { save, pending, message };
}

export function TreasuryForms() {
  const snapshot = useTreasurySave(); const bankImport = useTreasurySave();
  const requestId = useRef<string | null>(null);
  const [csv, setCsv] = useState(""); const [source, setSource] = useState("");
  const [fileError, setFileError] = useState("");
  let preview: ReturnType<typeof parseBankImport> | null = null; let previewError = "";
  if (csv && source) {
    try { preview = parseBankImport({ source, csv }); } catch (error) { previewError = (error as Error).message; }
  }
  async function saveSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    requestId.current ??= crypto.randomUUID();
    const success = await snapshot.save({ action: "snapshot", id: requestId.current,
      balance_vnd: Number(data.get("balance")), fee_buffer_vnd: Number(data.get("buffer")),
      as_of: `${data.get("asOf")}:00+07:00`, note: data.get("note") });
    if (success) requestId.current = null;
  }
  return <div className="my-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
    <details className="rounded-lg border border-cream-border p-4">
      <summary className="cursor-pointer text-sm font-semibold">Xác nhận số dư tiền thực</summary>
      <p className="my-3 text-xs leading-relaxed text-stone-alt">Nhập tổng tiền thực dành riêng cho chi trả của Vịnh, sau khi loại tiền bị phong tỏa và tiền vận hành. Tiền đã chuyển giữa các nguồn chỉ tính một lần. Không lấy tổng tiền nạp làm số dư.</p>
      <form onSubmit={saveSnapshot} className="grid gap-3">
        <label className="text-xs">Tiền khả dụng dành cho chi trả (VND)<input className={field} name="balance" type="number" min="0" max="1000000000000" step="1" required /></label>
        <label className="text-xs">Dự phòng phí bổ sung (VND)<input className={field} name="buffer" type="number" min="0" max="1000000000000" step="1" defaultValue="0" required /></label>
        <label className="text-xs">Thời điểm xác nhận (giờ Việt Nam, UTC+7)<input className={field} name="asOf" type="datetime-local" required /></label>
        <label className="text-xs">Nguồn xác nhận và phạm vi tài khoản<textarea className={field} name="note" maxLength={1000} required placeholder="Ví dụ: số dư khả dụng tài khoản chi Vịnh theo sao kê…" /></label>
        <button disabled={snapshot.pending} className={button}>{snapshot.pending ? "Đang lưu…" : "Lưu bản xác nhận"}</button>
        <p role="status" className="text-sm">{snapshot.message}</p>
      </form>
    </details>
    <details className="rounded-lg border border-cream-border p-4">
      <summary className="cursor-pointer text-sm font-semibold">Nhập sao kê CSV để đối soát</summary>
      <p className="my-3 text-xs leading-relaxed text-stone-alt">Tệp UTF-8, tối đa 200 giao dịch/lần. Số tiền dương chưa trừ phí; phí ở cột riêng. Thời gian ISO có múi giờ. Tham chiếu dùng ID nạp/rút nội bộ; có thể để trống rồi liên kết bên dưới. Nhập lại cùng mã nguồn + mã ngân hàng không tạo bản trùng.</p>
      <a className="text-xs underline" download="vinh-bank-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(`${CSV_HEADER}\nBANK-001,in,100000,0,2026-10-22T10:00:00+07:00,,\n`)}`}>Tải CSV mẫu</a>
      <form onSubmit={async event => { event.preventDefault(); if (preview) await bankImport.save({ action: "import", source, csv }); }} className="mt-3 grid gap-3">
        <label className="text-xs">Mã nguồn cố định cho tài khoản (ví dụ: vcb-vinh-01)<input className={field} value={source} onChange={e => setSource(e.target.value)} maxLength={80} required /></label>
        <label className="text-xs">Tệp CSV<input className={field} type="file" accept=".csv,text/csv" required onChange={async event => {
          setCsv(""); setFileError(""); const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 200000) { setFileError("Tệp tối đa 200 KB."); return; }
          try { setCsv(await file.text()); } catch { setFileError("Không đọc được tệp."); }
        }} /></label>
        {(fileError || previewError) && <p role="alert" className="text-sm text-red-700">{fileError || previewError}</p>}
        {preview && <div className="text-xs"><p>{preview.entries.length} dòng hợp lệ. Xem trước tối đa 3 dòng:</p>
          {preview.entries.slice(0, 3).map(row => <p key={row.external_id} className="break-all">{row.external_id} · {row.direction === "in" ? "Thu" : "Chi"} · {formatVnd(row.amount_vnd)}</p>)}
        </div>}
        <button disabled={!preview || bankImport.pending} className={button}>{bankImport.pending ? "Đang nhập…" : "Nhập các giao dịch"}</button>
        <p role="status" className="text-sm">{bankImport.message}</p>
      </form>
    </details>
  </div>;
}

export function ReconciliationLinkForm({ id, type, referenceId }: { id: string; type: string | null; referenceId: string | null }) {
  const { save, pending, message } = useTreasurySave();
  return <details className="mt-2 text-xs"><summary className="cursor-pointer underline">Liên kết / sửa tham chiếu</summary>
    <form className="mt-2 grid gap-2" onSubmit={async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const nextType = data.get("type");
      await save({ action: "link", bank_entry_id: id, reference_type: nextType || null,
        reference_id: nextType ? data.get("referenceId") : null, note: data.get("note") });
    }}>
      <label>Loại giao dịch<select name="type" defaultValue={type || ""} className={field}><option value="">Bỏ liên kết</option><option value="deposit">Nạp tiền</option><option value="withdrawal">Rút tiền</option></select></label>
      <label>ID giao dịch nội bộ<input className={field} name="referenceId" defaultValue={referenceId || ""} placeholder="UUID trong deposit_transactions / withdrawal_requests" /></label>
      <label>Lý do thay đổi<input className={field} name="note" required maxLength={1000} /></label>
      <button className={button} disabled={pending}>{pending ? "Đang lưu…" : "Lưu tham chiếu"}</button>
      <p role="status">{message}</p>
    </form>
  </details>;
}
