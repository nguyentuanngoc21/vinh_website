const COHORTS: [string, number, number, number][] = [
  ["Th 3", 68, 49, 43],
  ["Th 4", 71, 52, 44],
  ["Th 5", 66, 47, 41],
  ["Th 6", 73, 51, 42],
];

function shade(value: number) {
  if (value >= 60) return "#1F8A5B";
  if (value >= 40) return "#3B9B6F";
  if (value >= 25) return "#6FBFA3";
  return "#A8C9BC";
}

export function RetentionCohort() {
  return (
    <div className="rounded-[14px] border border-cream-border bg-white p-[22px]">
      <div className="text-base font-bold text-brand-ink">
        Retention theo cohort
      </div>
      <div className="mb-4 mt-1 text-xs text-stone-alt">
        % quay lại sau D1 / D7 / D30
      </div>
      <div className="flex flex-col gap-2">
        {COHORTS.map(([label, d1, d7, d30]) => (
          <div key={label} className="flex items-center gap-2.5">
            <div className="w-[54px] text-xs font-medium text-stone-alt">
              {label}
            </div>
            <div className="flex flex-1 gap-1.5">
              {[d1, d7, d30].map((value, i) => (
                <div
                  key={i}
                  style={{ background: shade(value) }}
                  className="flex h-[30px] flex-1 items-center justify-center rounded-[5px] text-xs font-semibold text-white"
                >
                  {value}%
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
