import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";

// Trước đây COHORTS bịa hoàn toàn (dựng từ ngày đầu scaffold dự án).
// KHÔNG nối dữ liệu thật ở đây — % quay lại sau D1/D7/D30 cần bảng
// theo dõi phiên đăng nhập/hoạt động theo ngày mà repo hiện chưa có
// (không có session/activity log nào để tính "quay lại sau N ngày").
// Hiện rõ "chưa có dữ liệu" thay vì bịa tiếp; xây tính năng này cần thêm
// hạ tầng tracking trước, không phải chỉ đổi component này.
export function RetentionCohort() {
  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      <div className="text-base font-bold text-brand-ink">
        Retention theo cohort
      </div>
      <div className="mb-4 mt-1 text-xs text-stone-alt">
        % quay lại sau D1 / D7 / D30
      </div>
      <div className="flex flex-col items-center justify-center gap-2 rounded-[10px] bg-neutral-bg py-8 text-center">
        <WarningCircleIcon size={22} className="text-stone-alt" />
        <div className="text-sm font-medium text-stone-alt">Chưa có dữ liệu</div>
        <div className="max-w-[260px] text-xs text-stone-alt/80">
          Cần bảng theo dõi phiên đăng nhập/hoạt động theo ngày — chưa có trong hệ thống.
        </div>
      </div>
    </div>
  );
}
