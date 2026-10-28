import Link from "next/link";
import { exposureTotals, type WalletExposure } from "@/lib/admin/wallet-exposure";
import { TOKEN_TO_VND_RATE, tokensToVnd } from "@/lib/wallet/config";
import { formatVnd } from "@/lib/format-currency";

const count = (n: number) => n.toLocaleString("vi-VN");

export function WalletExposurePanel({ stats, search, page }: { stats: WalletExposure; search: string; page: number }) {
  const total = exposureTotals(stats);
  const pages = Math.max(1, Math.ceil(stats.userCount / 25));
  const pageHref = (next: number) => `/admin?${new URLSearchParams({ walletSearch: search, walletPage: String(next) })}#token-balances`;
  const cards = [
    ["Token khả dụng trong ví", count(stats.available), formatVnd(tokensToVnd(stats.available))],
    ["Token chờ đối soát", count(stats.pending), formatVnd(tokensToVnd(stats.pending))],
    ["Rút đang xử lý (đã trừ ví)", count(stats.processing), formatVnd(stats.processingVnd)],
    ["Dự phòng tối đa cho số dư ví", `${count(total.tokens)} token`, formatVnd(total.vnd)],
  ];
  return (
    <section id="token-balances" className="mb-6 min-w-0 rounded-[14px] border border-cream-border bg-surface p-4 sm:p-[22px]">
      <h2 className="text-lg font-bold">Số dư token & nghĩa vụ chi trả</h2>
      <p className="mt-1 text-xs text-stone-alt">
        Toàn hệ thống · {new Date(stats.asOf).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} (giờ Việt Nam)
      </p>
      <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, tokens, vnd]) => <div key={label} className="rounded-lg bg-surface-warm p-4">
          <div className="text-xs text-stone-alt">{label}</div>
          <div className="mt-2 break-words text-xl font-bold">{tokens}</div>
          <div className="mt-1 text-sm">{vnd}</div>
        </div>)}
      </div>
      <p className="text-sm leading-relaxed text-stone-alt">
        Khả dụng + rút đang xử lý: <strong>{formatVnd(total.availableAndProcessingVnd)}</strong>.
        {" "}Dự phòng tối đa cộng thêm toàn bộ token chờ đối soát, theo tỷ giá {formatVnd(TOKEN_TO_VND_RATE)}/token;
        khoản rút đang xử lý dùng số VND đã ghi nhận khi tạo yêu cầu.
        Đây là kịch bản toàn bộ số dư được quy đổi, chưa áp dụng xác minh, mức rút tối thiểu hay hạn mức từng người;
        không phải số được phép rút ngay. Chưa bao gồm phí thanh toán và tiền đang giữ trong đơn commission chưa ghi có vào ví.
        Xem phần tiền thực phía trên để so sánh với số dư đã xác nhận thủ công.
      </p>
      <form action="/admin#token-balances" className="my-4 flex flex-wrap gap-2">
        <label htmlFor="wallet-search" className="sr-only">Tìm người sở hữu token</label>
        <input id="wallet-search" name="walletSearch" defaultValue={search} maxLength={100} placeholder="Tên, username hoặc ID người dùng" className="min-w-0 flex-1 rounded-lg border border-cream-border bg-surface px-3 py-2 text-sm" />
        <button className="rounded-lg bg-brand-ink px-4 py-2 text-sm text-white">Tìm kiếm</button>
        {search && <Link href="/admin#token-balances" className="px-3 py-2 text-sm underline">Xóa lọc</Link>}
      </form>
      <p className="mb-2 text-xs text-stone-alt">{count(stats.userCount)} người dùng{search ? " khớp bộ lọc" : ""} · Sắp xếp tổng token giảm dần. Các thẻ tổng phía trên luôn tính toàn hệ thống.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-cream-border text-xs text-stone-alt"><tr>
            <th className="p-2">Người dùng</th><th className="p-2 text-right">Khả dụng</th><th className="p-2 text-right">Chờ đối soát</th>
            <th className="p-2 text-right">Rút đang xử lý</th><th className="p-2 text-right">Tổng token</th><th className="p-2 text-right">Dự phòng VND</th>
          </tr></thead>
          <tbody>{stats.users.map(user => <tr key={user.id} className="border-b border-cream-border">
            <td className="p-2"><div>{user.nickname || user.username}</div><div className="text-xs text-stone-alt">@{user.username}</div><div className="text-[10px] text-stone-alt">{user.id}</div></td>
            <td className="p-2 text-right">{count(user.available)}</td><td className="p-2 text-right">{count(user.pending)}</td>
            <td className="p-2 text-right">{count(user.processing)}</td><td className="p-2 text-right font-semibold">{count(user.available + user.pending + user.processing)}</td>
            <td className="p-2 text-right">{formatVnd(tokensToVnd(user.available + user.pending) + user.processing_vnd)}</td>
          </tr>)}</tbody>
        </table>
        {stats.users.length === 0 && <p className="py-6 text-center text-sm text-stone-alt">Không có người dùng ở trang này.</p>}
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        {page > 1 ? <Link href={pageHref(page - 1)} className="underline">Trang trước</Link> : <span />}
        <span>Trang {page}/{pages}</span>
        {page < pages ? <Link href={pageHref(page + 1)} className="underline">Trang sau</Link> : <span />}
      </div>
    </section>
  );
}
