import { describe, expect, it } from "vitest";
import { describeFraudSignal, FRAUD_SIGNAL_LABEL } from "./fraud-labels";

describe("describeFraudSignal", () => {
  it("bình chọn dồn dập", () => {
    expect(describeFraudSignal("rapid_voting", { votes_in_window: 12, window_minutes: 10, window_start: "2026-09-26T03:00:00Z" }))
      .toBe("12 phiếu trong 10 phút (từ 10:00 26/09/2026).");
  });

  it("tài khoản vừa đủ tuổi — numeric từ Postgres có thể là chuỗi", () => {
    expect(describeFraudSignal("new_account_mass_voting", { account_age_days_at_first_vote: "7.5", votes: 6 }))
      .toBe("Tài khoản 7,5 ngày tuổi lúc bỏ phiếu đầu tiên, đã bầu 6 tác phẩm.");
  });

  it("bằng chứng thiếu hoặc mã lạ → null", () => {
    expect(describeFraudSignal("rapid_voting", {})).toBeNull();
    expect(describeFraudSignal("unknown_code", { votes: 1 })).toBeNull();
  });

  it("mọi mã do SQL gắn đều có nhãn", () => {
    expect(Object.keys(FRAUD_SIGNAL_LABEL).sort()).toEqual(["new_account_mass_voting", "rapid_voting"]);
  });
});
