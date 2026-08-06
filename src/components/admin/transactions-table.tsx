const TRANSACTIONS = [
  {
    id: "#VIN-90412",
    user: "Lê Thu Trang",
    item: "Mở khóa Ch.18",
    amount: "₫12.000",
    status: "Thành công",
  },
  {
    id: "#VIN-90411",
    user: "Nguyễn Hoàng",
    item: "Gói tháng VIP",
    amount: "₫79.000",
    status: "Thành công",
  },
  {
    id: "#VIN-90410",
    user: "Phạm Minh Anh",
    item: "Tặng tác giả",
    amount: "₫50.000",
    status: "Chờ",
  },
  {
    id: "#VIN-90409",
    user: "Trần Quốc Huy",
    item: "Mở khóa trọn bộ",
    amount: "₫149.000",
    status: "Thành công",
  },
  {
    id: "#VIN-90408",
    user: "Vũ Hà My",
    item: "Gói tháng VIP",
    amount: "₫79.000",
    status: "Hoàn tiền",
  },
];

function badgeStyle(status: string) {
  if (status === "Thành công") return { bg: "#DBF3E8", ink: "#2C7453" };
  if (status === "Chờ") return { bg: "#FFE6CC", ink: "#894701" };
  return { bg: "#F8D7DA", ink: "#B02A37" };
}

const GRID_COLS = "grid-cols-[120px_1fr_130px_110px_100px]";

export function TransactionsTable() {
  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="text-base font-bold text-brand-ink">
          Giao dịch gần đây
        </div>
        <span className="cursor-pointer text-[13px] font-medium text-brand-gold-dark">
          Xem tất cả →
        </span>
      </div>
      <div
        className={`grid ${GRID_COLS} gap-3 border-b border-cream-border px-2.5 pb-2.5 text-xs font-semibold text-stone-alt`}
      >
        <div>Mã GD</div>
        <div>Người dùng</div>
        <div>Nội dung</div>
        <div>Số tiền</div>
        <div>Trạng thái</div>
      </div>
      {TRANSACTIONS.map((t) => {
        const { bg, ink } = badgeStyle(t.status);
        return (
          <div
            key={t.id}
            className={`grid ${GRID_COLS} items-center gap-3 border-b border-[#F1ECE0] px-2.5 py-[13px] text-sm font-medium text-[#3a352e] transition-colors hover:bg-[#FBF8F1]`}
          >
            <div className="text-xs font-semibold text-stone-alt">{t.id}</div>
            <div>{t.user}</div>
            <div className="text-stone-alt">{t.item}</div>
            <div className="font-semibold">{t.amount}</div>
            <div>
              <span
                style={{ background: bg, color: ink }}
                className="rounded-full px-[11px] py-1 text-[11px] font-semibold"
              >
                {t.status}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
