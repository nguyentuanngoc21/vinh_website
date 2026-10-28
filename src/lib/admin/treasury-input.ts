export type BankEntryInput = {
  external_id: string; direction: "in" | "out"; amount_vnd: number; fee_vnd: number;
  occurred_at: string; reference_type: "deposit" | "withdrawal" | null; reference_id: string | null;
};
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_MONEY = 1_000_000_000_000;

function money(value: unknown, positive = false): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (positive ? 1 : 0) || value > MAX_MONEY) {
    throw new Error("Số tiền phải là số nguyên VND, trong khoảng cho phép (tối đa 1.000 tỷ).");
  }
  return value;
}
function text(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${label} không hợp lệ.`);
  return value.trim();
}
function timestamp(value: unknown, now: number): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value)) || Date.parse(value) > now + 300000) throw new Error("Thời điểm không hợp lệ, cần ISO 8601 có múi giờ và không ở tương lai.");
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) throw new Error("Ngày không tồn tại trong lịch.");
  return new Date(value).toISOString();
}
function reference(type: unknown, id: unknown): Pick<BankEntryInput, "reference_type" | "reference_id"> {
  if ((type === null || type === "") && (id === null || id === "")) return { reference_type: null, reference_id: null };
  if ((type !== "deposit" && type !== "withdrawal") || typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw new Error("Tham chiếu phải gồm deposit/withdrawal và UUID nội bộ, hoặc để trống cả hai.");
  }
  return { reference_type: type, reference_id: id };
}
export function parseSnapshot(body: Record<string, unknown>, now = Date.now()) {
  if (typeof body.id !== "string" || !UUID_PATTERN.test(body.id)) throw new Error("Mã cập nhật không hợp lệ.");
  return { id: body.id, balance_vnd: money(body.balance_vnd), fee_buffer_vnd: money(body.fee_buffer_vnd),
    as_of: timestamp(body.as_of, now), note: text(body.note, 1000, "Nguồn xác nhận/ghi chú") };
}
export function parseLink(body: Record<string, unknown>) {
  if (typeof body.bank_entry_id !== "string" || !UUID_PATTERN.test(body.bank_entry_id)) throw new Error("Mã giao dịch sao kê không hợp lệ.");
  return { bank_entry_id: body.bank_entry_id, ...reference(body.reference_type, body.reference_id), note: text(body.note, 1000, "Lý do liên kết") };
}

/** RFC4180-style quoted fields; reject malformed files instead of silently changing amounts. */
function csvRows(csv: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false; let closed = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ""; closed = false;
      if (c !== ',') { if (row.some(cell => cell.trim())) rows.push(row); row = []; if (c === '\r' && csv[i + 1] === '\n') i++; }
    } else if (c === '"' && field === "" && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error("CSV có dấu ngoặc kép không hợp lệ."); field += c; }
  }
  if (quoted) throw new Error("CSV chưa đóng dấu ngoặc kép.");
  row.push(field); if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}
export const CSV_HEADER = "external_id,direction,amount_vnd,fee_vnd,occurred_at,reference_type,reference_id";
export function parseBankImport(body: Record<string, unknown>, now = Date.now()) {
  const source = text(body.source, 80, "Mã nguồn/tài khoản").toLowerCase();
  if (typeof body.csv !== "string" || body.csv.length > 200000) throw new Error("CSV tối đa 200 KB.");
  const rows = csvRows(body.csv.replace(/^\uFEFF/, ""));
  if (rows.shift()?.map(s => s.trim()).join(",") !== CSV_HEADER) throw new Error(`CSV phải có tiêu đề: ${CSV_HEADER}`);
  if (rows.length < 1 || rows.length > 200) throw new Error("Mỗi lần nhập từ 1 đến 200 giao dịch.");
  const ids = new Set<string>();
  const entries: BankEntryInput[] = rows.map((row, index) => {
    try {
      if (row.length !== 7) throw new Error("Cần đủ 7 cột.");
      const [externalId, direction, amount, fee, occurredAt, type, id] = row.map(s => s.trim());
      const external_id = text(externalId, 120, "Mã ngân hàng");
      if (ids.has(external_id)) throw new Error("Trùng mã ngân hàng trong tệp.");
      ids.add(external_id);
      if (direction !== "in" && direction !== "out") throw new Error("Chiều giao dịch phải là in hoặc out.");
      if (!/^\d+$/.test(amount) || !/^\d+$/.test(fee)) throw new Error("Số tiền/phí chỉ dùng chữ số, không có dấu phân cách.");
      return { external_id, direction, amount_vnd: money(Number(amount), true), fee_vnd: money(Number(fee)),
        occurred_at: timestamp(occurredAt, now), ...reference(type, id) };
    } catch (error) { throw new Error(`Dòng ${index + 2}: ${(error as Error).message}`); }
  });
  return { source, entries };
}
