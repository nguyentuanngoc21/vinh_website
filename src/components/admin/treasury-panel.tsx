import Link from "next/link";
import { exposureTotals, type WalletExposure } from "@/lib/admin/wallet-exposure";
import { reservePosition, type TreasuryReport, type TreasuryEntry } from "@/lib/admin/treasury";
import { formatVnd } from "@/lib/format-currency";
import { TreasuryForms, ReconciliationLinkForm } from "./treasury-forms";

const date = (value: string) => new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const labels: Record<TreasuryEntry["reconciliation_status"], string> = {
  matched: "Khớp", unlinked: "Chưa liên kết", duplicate_reference: "Trùng tham chiếu nội bộ",
  missing_reference: "Không tìm thấy tham chiếu", direction_mismatch: "Sai chiều thu/chi",
  amount_mismatch: "Lệch số tiền", internal_pending: "Nội bộ chưa thành công",
};
export function TreasuryPanel({ report, exposure, page }: { report: TreasuryReport; exposure: WalletExposure; page: number }) {
  const snapshot = report.snapshot;
  const liability = exposureTotals(exposure).vnd;
  const position = reservePosition(snapshot?.balance_vnd ?? null, liability, snapshot?.fee_buffer_vnd ?? 0);
  const stale = !!snapshot && Date.parse(report.asOf) - Date.parse(snapshot.as_of) > 24 * 60 * 60 * 1000;
  const pages = Math.max(1, Math.ceil(report.entryCount / 25));
  return <section id="treasury" className="mb-6 min-w-0 rounded-[14px] border border-cream-border bg-surface p-4 sm:p-[22px]">
    <h2 className="text-lg font-bold">Tiền thực, dự trữ & đối soát</h2>
    <p className="mt-1 text-xs text-stone-alt">Số dư xác nhận thủ công · Chưa kết nối ngân hàng · Thời điểm báo cáo {date(report.asOf)} (giờ Việt Nam)</p>
    <div className="my-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Tiền thực dành cho chi trả", snapshot ? formatVnd(snapshot.balance_vnd) : "Chưa xác nhận"],
        ["Dự phòng ví + phí bổ sung", position ? formatVnd(position.required) : `${formatVnd(liability)} + phí chưa xác nhận`],
        ["Thiếu hụt dự trữ ước tính", position ? formatVnd(position.shortfall) : "Chưa xác định"],
        ["Mức bao phủ dự trữ", position?.coverage == null ? "—" : `${position.coverage.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`],
      ].map(([label, value]) => <div key={label} className="rounded-lg bg-surface-warm p-4"><div className="text-xs text-stone-alt">{label}</div><div className="mt-2 break-words text-xl font-bold">{value}</div></div>)}
    </div>
    {snapshot ? <div className="text-sm text-stone-alt">
      <p>Số dư tại {date(snapshot.as_of)} · nhập bởi {snapshot.created_by}. Dự phòng phí: {formatVnd(snapshot.fee_buffer_vnd)}.</p>
      <p className="break-words">Nguồn/phạm vi: {snapshot.note}</p>
      {stale && <p role="status" className="mt-2 font-semibold text-amber-700">Số dư đã quá 24 giờ. Cần xác nhận lại trước khi dùng để quyết định chi tiền.</p>}
      <p className="mt-2">So sánh số dư đã xác nhận với nghĩa vụ ví hiện tại; chưa gồm commission chưa ghi có vào ví. Sao kê nhập bên dưới không tự cộng/trừ số dư này. Kết quả là ước tính tại hai thời điểm; không phải số dư ngân hàng trực tiếp.</p>
    </div> : <p className="text-sm text-stone-alt">Chưa có số dư xác nhận. Hệ thống không mặc định tiền thực bằng 0 và chưa thể kết luận thiếu hụt.</p>}
    <TreasuryForms />
    <details className="mb-5 text-xs"><summary className="cursor-pointer underline">Lịch sử xác nhận gần đây</summary>
      <ul className="mt-2 space-y-2">{report.history.map(row => <li key={row.id} className="break-words">{date(row.as_of)} · {formatVnd(row.balance_vnd)} · phí dự phòng {formatVnd(row.fee_buffer_vnd)} · {row.note} · người nhập {row.created_by}</li>)}</ul>
    </details>
    <h3 className="font-semibold">Đối chiếu giao dịch đã nhập</h3>
    <p className="my-2 text-sm">{report.entryCount} giao dịch · {report.matchedCount} khớp · {report.unresolvedCount} cần kiểm tra · Tổng phí trên dữ liệu đã nhập: {formatVnd(report.importedFeesVnd)}</p>
    <p className="mb-3 text-xs text-stone-alt">“Khớp” cần đúng ID, chiều thu/chi, số tiền và trạng thái nội bộ thành công, không trùng tham chiếu. Chỉ kiểm tra bằng chứng đã nhập; không khẳng định sao kê đầy đủ. Liên kết không tự xác nhận nạp/rút hay thay đổi token.</p>
    <details className="mb-4 rounded-lg bg-surface-warm p-3 text-xs">
      <summary className="cursor-pointer font-semibold">{report.unseenCount} giao dịch nội bộ thành công chưa có liên kết sao kê</summary>
      <p className="my-2 text-stone-alt">Kiểm tra toàn bộ lịch sử, hiển thị tối đa 10 giao dịch gần nhất. Có thể do chưa nhập đủ sao kê hoặc chưa gán ID; không đồng nghĩa tiền bị mất.</p>
      {report.unseen.map(row => <p key={`${row.reference_type}-${row.reference_id}`} className="mb-1 break-all">{row.reference_type === "deposit" ? "Nạp" : "Rút"} · {row.reference_id} · {formatVnd(row.amount_vnd)} · {row.processed_at ? date(row.processed_at) : "Chưa có thời điểm xử lý"}</p>)}
    </details>
    <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
      <thead className="border-b border-cream-border text-xs text-stone-alt"><tr><th className="p-2">Thời gian / nguồn</th><th className="p-2">Mã ngân hàng</th><th className="p-2 text-right">Thu/chi & phí</th><th className="p-2">Tham chiếu nội bộ</th><th className="p-2">Kết quả</th></tr></thead>
      <tbody>{report.entries.map(row => <tr key={row.id} className="border-b border-cream-border align-top">
        <td className="p-2">{date(row.occurred_at)}<div className="text-xs text-stone-alt">{row.source}</div></td>
        <td className="max-w-[160px] break-words p-2">{row.external_id}</td>
        <td className="p-2 text-right">{row.direction === "in" ? "+" : "−"}{formatVnd(row.amount_vnd)}<div className="text-xs text-stone-alt">Phí: {formatVnd(row.fee_vnd)}</div></td>
        <td className="max-w-[240px] break-words p-2 text-xs"><div>{row.linked_type || "—"} {row.linked_id}</div><div>{row.internal_status || ""}</div>
          <ReconciliationLinkForm id={row.id} type={row.linked_type} referenceId={row.linked_id} />
        </td>
        <td className="p-2"><span className={row.reconciliation_status === "matched" ? "text-green-700" : "text-amber-700"}>{labels[row.reconciliation_status]}</span>
          {row.expected_vnd !== null && <div className="text-xs text-stone-alt">Sổ Vịnh: {formatVnd(row.expected_vnd)}</div>}
        </td>
      </tr>)}</tbody>
    </table></div>
    {!report.entries.length && <p className="py-5 text-center text-sm text-stone-alt">Chưa có giao dịch ở trang này.</p>}
    <div className="mt-4 flex justify-between text-sm">
      {page > 1 ? <Link className="underline" href={`/admin?treasuryPage=${page - 1}#treasury`}>Trang trước</Link> : <span />}
      <span>Trang {page}/{pages}</span>
      {page < pages ? <Link className="underline" href={`/admin?treasuryPage=${page + 1}#treasury`}>Trang sau</Link> : <span />}
    </div>
  </section>;
}
