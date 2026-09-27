import { describe, expect, it } from "vitest";
import { DEFAULT_FINAL_SCORING_CONFIG, parseFinalScoringConfig, rubricTotal, type FinalScoringConfig } from "./config";

const clone = (): FinalScoringConfig => JSON.parse(JSON.stringify(DEFAULT_FINAL_SCORING_CONFIG));

describe("DEFAULT_FINAL_SCORING_CONFIG", () => {
  it("hợp lệ, đúng đặc tả 26/09/2026 và J4/J8/J9", () => {
    const d = DEFAULT_FINAL_SCORING_CONFIG;
    expect(parseFinalScoringConfig(d).ok).toBe(true);
    const w = d.components;
    expect([w.judge.weight, w.reader.weight, w.reading_quality.weight, w.engagement.weight, w.vote.weight]).toEqual([0.5, 0.15, 0.15, 0.1, 0.1]);
    // J3 (27/09/2026): mùa đầu so với bài cao nhất; BGK giữ thang tuyệt đối.
    expect(w.judge.normalization).toEqual({ type: "none" });
    expect(w.reader).toMatchObject({ transformation: "log", normalization: { type: "relative_max" } });
    expect(w.vote.normalization).toEqual({ type: "relative_max" });
    expect(w.engagement.adjustment).toEqual({ type: "bayesian", prior_strength: 20 });
    expect(w.reading_quality.depth).toMatchObject({ weight: 0.7, aggregation: "median", adjustment: { type: "bayesian", prior_strength: 10 } });
    expect(w.reading_quality.return.weight).toBe(0.3);
    expect(d.rubric.map((r) => r.max)).toEqual([25, 20, 20, 15, 20]);
    expect(d.tie_break).toEqual(["judge", "reading_quality", "reader", "submitted_at"]);
    expect(d.special_awards.order.map((a) => a.component)).toEqual(["vote", "reading_quality", "engagement"]);
    expect(d.main_awards.flatMap((a) => a.positions)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("parseFinalScoringConfig", () => {
  it("tổng trọng số phải bằng 1", () => {
    const c = clone();
    c.components.judge.weight = 0.6;
    expect(parseFinalScoringConfig(c)).toMatchObject({ ok: false });
  });

  it("thiếu khoá / khoá lạ bị từ chối (mỗi version phải tự đủ)", () => {
    const { tie_break: _drop, ...missing } = clone();
    void _drop;
    expect(parseFinalScoringConfig(missing).ok).toBe(false);
    expect(parseFinalScoringConfig({ ...clone(), extra: 1 }).ok).toBe(false);
  });

  it("rubric tổng 100, code không trùng", () => {
    const c = clone();
    c.rubric[0].max = 30;
    expect(parseFinalScoringConfig(c).ok).toBe(false);
    const d = clone();
    d.rubric[1].code = "plot";
    expect(parseFinalScoringConfig(d).ok).toBe(false);
  });

  it("hạng giải chính không trùng; mã giải không trùng giữa chính và đặc biệt", () => {
    const c = clone();
    c.main_awards[1].positions = [1, 2];
    expect(parseFinalScoringConfig(c).ok).toBe(false);
    const d = clone();
    d.special_awards.order[0].code = "first_prize";
    expect(parseFinalScoringConfig(d).ok).toBe(false);
  });

  it.each([
    ["require_all_judges", "yes"],
    ["engagement_actions", ["share"]],
    ["tie_break", ["judge", "judge"]],
  ])("%s sai → lỗi", (key, value) => {
    expect(parseFinalScoringConfig({ ...clone(), [key]: value }).ok).toBe(false);
  });

  it("depth + return = 1", () => {
    const c = clone();
    c.components.reading_quality.return.weight = 0.5;
    expect(parseFinalScoringConfig(c).ok).toBe(false);
  });

  it("J3: không chuẩn hoá điểm BGK; reference_value cần reference > 0; không log 2 lần", () => {
    const a = clone();
    a.components.judge.normalization = { type: "relative_max" };
    expect(parseFinalScoringConfig(a).ok).toBe(false);
    const b = clone();
    b.components.vote.normalization = { type: "reference_value", reference: 0 };
    expect(parseFinalScoringConfig(b).ok).toBe(false);
    const c = clone();
    c.components.vote.normalization = { type: "reference_value", reference: 0.3 };
    expect(parseFinalScoringConfig(c).ok).toBe(true);
    const d = clone();
    d.components.reader.normalization = { type: "log_relative_max" };
    expect(parseFinalScoringConfig(d).ok).toBe(false);
    const e = clone();
    e.components.engagement.normalization = { type: "none" };
    expect(parseFinalScoringConfig(e).ok).toBe(false);
  });
});

describe("rubricTotal", () => {
  it("cộng các tiêu chí có điểm, bỏ tiêu chí lạ", () => {
    expect(rubricTotal(DEFAULT_FINAL_SCORING_CONFIG.rubric, { plot: 20, characters: 15.5, bogus: 99 })).toBe(35.5);
  });
});
