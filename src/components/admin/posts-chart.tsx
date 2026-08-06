import { CircleIcon } from "@phosphor-icons/react/dist/ssr";

const MONTHLY_POSTS: [string, number, number][] = [
  ["T7", 38, 8],
  ["T8", 42, 11],
  ["T9", 47, 13],
  ["T10", 51, 15],
  ["T11", 46, 12],
  ["T12", 58, 18],
  ["T1", 62, 19],
  ["T2", 55, 16],
  ["T3", 68, 22],
  ["T4", 71, 24],
  ["T5", 66, 21],
  ["T6", 79, 28],
];
const MAX_VALUE = 110;

export function PostsChart() {
  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      <div className="mb-[18px] flex items-center justify-between">
        <div>
          <div className="text-base font-bold text-brand-ink">
            Bài đăng mỗi tháng
          </div>
          <div className="text-xs text-stone-alt">
            Chương xuất bản · 12 tháng gần nhất
          </div>
        </div>
        <div className="flex items-center gap-3.5 text-xs font-medium text-stone-alt">
          <span className="flex items-center gap-1.5">
            <CircleIcon weight="fill" size={9} color="var(--color-brand-ink)" /> Truyện chữ
          </span>
          <span className="flex items-center gap-1.5">
            <CircleIcon weight="fill" size={9} color="var(--color-brand-gold)" /> Audio
          </span>
        </div>
      </div>
      <div className="flex h-[180px] items-end gap-2.5">
        {MONTHLY_POSTS.map(([label, text, audio]) => (
          <div
            key={label}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          >
            <div className="flex h-full w-full max-w-[26px] flex-col justify-end overflow-hidden rounded-[5px]">
              <div
                style={{ height: `${(audio / MAX_VALUE) * 100}%` }}
                className="bg-brand-gold"
              />
              <div
                style={{ height: `${(text / MAX_VALUE) * 100}%` }}
                className="bg-brand-ink"
              />
            </div>
            <div className="text-[11px] font-medium text-[#a8a29b]">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
