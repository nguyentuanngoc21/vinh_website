import { describe, expect, it } from "vitest";
import { parseBankImport, parseSnapshot, parseLink, CSV_HEADER } from "./treasury-input";
import { reservePosition } from "./treasury";

const id = "72000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-10-23T12:00:00Z");
const row = `BANK-001,in,100000,1000,2026-10-22T10:00:00+07:00,deposit,${id}`;
const parse = (csv: string) => parseBankImport({ source: " VCB-VINH ", csv: `${CSV_HEADER}\n${csv}` }, now);
describe("reserve position", () => {
  it("keeps unknown cash distinct from a confirmed zero balance", () => {
    expect(reservePosition(null, 100, 10)).toBeNull();
    expect(reservePosition(0, 100, 10)?.shortfall).toBe(110);
  });
  it("includes the fee buffer and never reports negative shortfalls", () => {
    expect(reservePosition(150, 100, 10)).toEqual({ required: 110, shortfall: 0, surplus: 40, coverage: 150 / 110 * 100 });
    expect(reservePosition(0, 0, 0)?.coverage).toBeNull();
  });
});
describe("manual evidence validation", () => {
  it("normalizes the bank source and explicit Vietnam timestamps", () => {
    const data = parse(row);
    expect(data.source).toBe("vcb-vinh");
    expect(data.entries[0]).toMatchObject({ amount_vnd: 100000, fee_vnd: 1000, occurred_at: "2026-10-22T03:00:00.000Z", reference_id: id });
  });
  it("supports quoted bank references, BOM, CRLF and blank references", () => {
    const result = parseBankImport({ source: "bank", csv: `\uFEFF${CSV_HEADER}\r\n"ABC,""quoted""",out,1,0,2026-10-22T00:00:00Z,,\r\n` }, now);
    expect(result.entries[0]).toMatchObject({ external_id: 'ABC,"quoted"', reference_type: null, reference_id: null });
  });
  it("rejects duplicate external IDs within a file", () => {
    expect(() => parse(`${row}\n${row}`)).toThrow(/Dòng 3/);
  });
  it.each(["-100", "1.5", "1e5", "1000000000001", "NaN"]) ("rejects invalid amount %s", amount => {
    expect(() => parse(row.replace(",100000,", `,${amount},`))).toThrow();
  });
  it("rejects malformed CSV, invalid dates and references", () => {
    expect(() => parse('"unterminated')).toThrow();
    expect(() => parse(row.replace("2026-10-22", "2026-02-30"))).toThrow();
    expect(() => parse(row.replace("+07:00", ""))).toThrow();
    expect(() => parse(row.replace("2026-10-22", "2027-10-22"))).toThrow();
    expect(() => parse(row.replace(id, "bad-id"))).toThrow();
    expect(() => parse(row.replace("deposit,", ","))).toThrow();
  });
  it("rejects oversized batches and wrong headers", () => {
    expect(() => parse(Array.from({ length: 201 }, (_, i) => row.replace("BANK-001", `BANK-${i}`)).join("\n"))).toThrow();
    expect(() => parseBankImport({ source: "bank", csv: "amount,fee\n1,0" }, now)).toThrow();
  });
  it("requires sourced, timestamped, non-negative cash observations", () => {
    const value = { id, balance_vnd: 0, fee_buffer_vnd: 10, as_of: "2026-10-22T00:00:00Z", note: "Bank closing balance" };
    expect(parseSnapshot(value, now).balance_vnd).toBe(0);
    expect(() => parseSnapshot({ ...value, note: " " }, now)).toThrow();
    expect(() => parseSnapshot({ ...value, balance_vnd: -1 }, now)).toThrow();
    expect(() => parseSnapshot({ ...value, fee_buffer_vnd: "10" }, now)).toThrow();
  });
  it("requires a reason for corrections and permits explicit unlinking", () => {
    expect(parseLink({ bank_entry_id: id, reference_type: null, reference_id: null, note: "Wrong source" }).reference_id).toBeNull();
    expect(() => parseLink({ bank_entry_id: id, reference_type: "deposit", reference_id: id, note: "" })).toThrow();
  });
});
