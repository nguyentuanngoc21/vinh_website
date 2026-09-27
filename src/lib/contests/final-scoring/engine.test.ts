import { describe, expect, it } from "vitest";
import { DEFAULT_FINAL_SCORING_CONFIG, type FinalScoringConfig } from "./config";
import { computeFinalScores, type SubmissionMetrics } from "./engine";

const cfg = (): FinalScoringConfig => JSON.parse(JSON.stringify(DEFAULT_FINAL_SCORING_CONFIG));

let seq = 0;
function m(over: Partial<SubmissionMetrics> = {}): SubmissionMetrics {
  seq += 1;
  return {
    submission_id: over.submission_id ?? `s${String(seq).padStart(3, "0")}`,
    submitted_at: over.submitted_at ?? `2026-12-${String((seq % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    has_snapshot: true,
    valid_readers: 100,
    reader_depths: Array(100).fill(0.5),
    returning_readers: 20,
    engaged_readers: 10,
    valid_votes: 10,
    judge_totals: [70],
    active_judges: 1,
    ...over,
  };
}
const byId = <T extends { submission_id: string }>(rows: T[], id: string): T => rows.find((r) => r.submission_id === id)!;

describe("computeFinalScores — điểm thành phần (J3)", () => {
  it("bài tốt nhất mọi mặt hệ thống được đủ 100 ở từng thành phần; FinalScore ≤ 100", () => {
    const best = m({ submission_id: "best", valid_readers: 1000, reader_depths: Array(1000).fill(0.9), returning_readers: 500, engaged_readers: 400, valid_votes: 300, judge_totals: [100] });
    const low = m({ submission_id: "low", valid_readers: 10, reader_depths: Array(10).fill(0.2), returning_readers: 1, engaged_readers: 1, valid_votes: 1, judge_totals: [40] });
    const { rows } = computeFinalScores(cfg(), [low, best]);
    const b = byId(rows, "best");
    expect([b.reader_score, b.depth_score, b.return_score, b.engagement_score, b.vote_score]).toEqual([100, 100, 100, 100, 100]);
    expect(b.final_score).toBe(100);
    expect(rows[0].submission_id).toBe("best");
  });

  it("RELATIVE_MAX giữ đủ dải điểm: tỷ lệ phiếu tốt nhất 25% vẫn được 100 VoteScore (không phải 25)", () => {
    const a = m({ submission_id: "a", valid_readers: 1000, valid_votes: 250 });
    const b = m({ submission_id: "b", valid_readers: 1000, valid_votes: 125 });
    const { rows } = computeFinalScores(cfg(), [a, b]);
    expect(byId(rows, "a").vote_score).toBe(100);
    expect(byId(rows, "b").vote_score).toBeGreaterThan(49);
    expect(byId(rows, "b").vote_score).toBeLessThan(51);
  });

  it("điểm BGK giữ thang tuyệt đối: cao nhất 80 vẫn là 80", () => {
    const { rows } = computeFinalScores(cfg(), [m({ submission_id: "a", judge_totals: [80] }), m({ submission_id: "b", judge_totals: [60, 70] })]);
    expect(byId(rows, "a").judge_score).toBe(80);
    expect(byId(rows, "b").judge_score).toBe(65);
  });

  it("FinalScore = Σ trọng số × điểm; SystemScore = phần hệ thống quy về 100", () => {
    const { rows } = computeFinalScores(cfg(), [m({ submission_id: "a" }), m({ submission_id: "b", valid_readers: 50, reader_depths: Array(50).fill(0.5) })]);
    for (const r of rows) {
      const sys = 0.15 * r.reader_score + 0.15 * r.reading_quality_score + 0.1 * r.engagement_score + 0.1 * r.vote_score;
      expect(r.final_score).toBeCloseTo(0.5 * (r.judge_score ?? 0) + sys, 5);
      expect(r.system_score).toBeCloseTo(sys / 0.5, 5);
      expect(r.reading_quality_score).toBeCloseTo(0.7 * r.depth_score + 0.3 * r.return_score, 5);
    }
  });

  it("Bayesian (C = 20): 5/5 bị kéo về gần mức chung (≈ 52%), không còn là 100% so với 40%", () => {
    const small = m({ submission_id: "small", valid_readers: 5, reader_depths: Array(5).fill(0.5), valid_votes: 5 });
    const big = m({ submission_id: "big", valid_readers: 1000, valid_votes: 400 });
    const { rows } = computeFinalScores(cfg(), [small, big]);
    const prior = 405 / 1005;
    expect(byId(rows, "small").raw_vote_rate).toBe(1);
    expect(byId(rows, "small").adjusted_vote_rate).toBeCloseTo((5 + 20 * prior) / 25, 5);
    expect(byId(rows, "big").adjusted_vote_rate).toBeCloseTo((400 + 20 * prior) / 1020, 5);
    // Khoảng cách 100% vs 40% (2,5 lần) co lại còn ≈ 1,3 lần.
    expect(byId(rows, "small").adjusted_vote_rate / byId(rows, "big").adjusted_vote_rate).toBeLessThan(1.35);
  });

  it("truyện ngắn và dài cùng 80% depth, cùng số độc giả → cùng DepthScore", () => {
    const { rows } = computeFinalScores(cfg(), [
      m({ submission_id: "short", reader_depths: Array(100).fill(0.8) }),
      m({ submission_id: "long", reader_depths: Array(100).fill(0.8) }),
    ]);
    expect(byId(rows, "short").depth_score).toBe(byId(rows, "long").depth_score);
  });

  it("cả cuộc thi 0 độc giả → 0 điểm hệ thống, không NaN, không tự cho 100", () => {
    const z = { valid_readers: 0, reader_depths: [], returning_readers: 0, engaged_readers: 0, valid_votes: 0 };
    const { rows } = computeFinalScores(cfg(), [m({ submission_id: "a", ...z }), m({ submission_id: "b", ...z })]);
    for (const r of rows) {
      expect([r.reader_score, r.depth_score, r.return_score, r.engagement_score, r.vote_score, r.system_score]).toEqual([0, 0, 0, 0, 0, 0]);
      expect(Number.isNaN(r.final_score)).toBe(false);
    }
  });
});

describe("computeFinalScores — cờ + trường hợp biên", () => {
  it("không có bài / chỉ 1 bài → gắn cờ", () => {
    expect(computeFinalScores(cfg(), []).flags).toEqual([{ code: "no_submissions" }]);
    expect(computeFinalScores(cfg(), [m()]).flags.map((f) => f.code)).toContain("single_submission");
  });

  it("thiếu phiếu BGK → cờ judging_incomplete, JudgeScore null, tính 0 vào FinalScore", () => {
    const r = computeFinalScores(cfg(), [m({ submission_id: "a", judge_totals: [], active_judges: 1 }), m({ submission_id: "b" })]);
    expect(r.judging_complete).toBe(false);
    expect(r.flags).toContainEqual({ code: "judging_incomplete", submission_ids: ["a"] });
    expect(byId(r.rows, "a").judge_score).toBeNull();
  });

  it("thiếu bản chụp → cờ snapshot_missing", () => {
    expect(computeFinalScores(cfg(), [m({ submission_id: "x", has_snapshot: false }), m()]).flags.map((f) => f.code)).toContain("snapshot_missing");
  });

  it("tất định: cùng input (thứ tự khác) → cùng kết quả", () => {
    const list = Array.from({ length: 8 }, (_, i) => m({ submission_id: `d${i}`, valid_readers: 10 * (i + 1), valid_votes: i, judge_totals: [50 + i] }));
    const a = computeFinalScores(cfg(), list);
    const b = computeFinalScores(cfg(), [...list].reverse());
    expect(b).toEqual(a);
  });
});

describe("xếp hạng + phá hoà (J8)", () => {
  it("FinalScore bằng nhau → BGK cao hơn đứng trên", () => {
    const c = cfg();
    c.components.judge.weight = 0;
    c.components.vote.weight = 0.6;
    const a = m({ submission_id: "a", judge_totals: [60] });
    const b = m({ submission_id: "b", judge_totals: [90] });
    const { rows } = computeFinalScores(c, [a, b]);
    expect(rows[0].final_score).toBe(rows[1].final_score);
    expect(rows.map((r) => r.submission_id)).toEqual(["b", "a"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("hoà mọi khoá (cả thời điểm nộp) → cùng hạng, đánh dấu đồng hạng", () => {
    const at = "2026-12-01T00:00:00Z";
    const { rows } = computeFinalScores(cfg(), [m({ submission_id: "a", submitted_at: at }), m({ submission_id: "b", submitted_at: at })]);
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
    expect(rows.every((r) => r.tied)).toBe(true);
  });

  it("chỉ khác thời điểm nộp → nộp sớm hơn đứng trên", () => {
    const { rows } = computeFinalScores(cfg(), [
      m({ submission_id: "late", submitted_at: "2026-12-10T00:00:00Z" }),
      m({ submission_id: "early", submitted_at: "2026-12-01T00:00:00Z" }),
    ]);
    expect(rows.map((r) => r.submission_id)).toEqual(["early", "late"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });
});

describe("đề xuất giải (J9)", () => {
  // 10 bài: điểm BGK giảm dần → hạng 1..10. Bài #7..#10 khác nhau ở phiếu / giữ chân / tương tác.
  const entries = () =>
    Array.from({ length: 10 }, (_, i) =>
      m({
        submission_id: `e${String(i + 1).padStart(2, "0")}`,
        // Top 6 chắc chắn nhờ BGK cách xa; #7–#10 chỉ khác nhau ở phần hệ thống.
        judge_totals: [i < 6 ? 100 - i * 2 : 10],
        valid_votes: i === 7 ? 90 : i === 6 ? 60 : 5,
        returning_readers: i === 8 ? 90 : 5,
        engaged_readers: i === 9 ? 90 : i === 7 ? 95 : 5,
      })
    );

  it("#1 Nhất, #2–3 Nhì, #4–6 Ba", () => {
    const { rows } = computeFinalScores(cfg(), entries());
    expect(rows.slice(0, 6).map((r) => r.awards.map((a) => a.code))).toEqual([
      ["first_prize"], ["second_prize"], ["second_prize"], ["third_prize"], ["third_prize"], ["third_prize"],
    ]);
  });

  it("giải đặc biệt: loại Top 6, mỗi bài tối đa 1 giải, xét A → B → C, giải còn lại chuyển cho bài kế tiếp", () => {
    const { rows } = computeFinalScores(cfg(), entries());
    const special = rows.flatMap((r) => r.awards.filter((a) => a.kind === "special").map((a) => [a.code, r.submission_id]));
    // e08 phiếu cao nhất → "được yêu thích nhất"; e08 cũng tương tác cao nhất nhưng đã có giải → e10 nhận "tương tác".
    expect(special).toContainEqual(["most_loved", "e08"]);
    expect(special).toContainEqual(["best_retention", "e09"]);
    expect(special).toContainEqual(["most_engaging", "e10"]);
    expect(rows.slice(0, 6).every((r) => r.awards.every((a) => a.kind === "main"))).toBe(true);
    expect(rows.every((r) => r.awards.filter((a) => a.kind === "special").length <= 1)).toBe(true);
  });

  it("không đủ bài ngoài Top 6 → giải đặc biệt không trao, gắn cờ", () => {
    const r = computeFinalScores(cfg(), entries().slice(0, 7));
    expect(r.flags.filter((f) => f.code === "award_unassigned").length).toBe(2);
  });
});
