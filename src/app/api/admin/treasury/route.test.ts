import { beforeEach, describe, expect, it, vi } from "vitest";
const { auth, insert, rpc } = vi.hoisted(() => ({ auth: vi.fn(), insert: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ from: () => ({ insert }), rpc }) }));
vi.mock("@/lib/wallet/session", () => ({ getAuthedAdminId: auth }));
import { POST } from "./route";
import { CSV_HEADER } from "@/lib/admin/treasury-input";
const id = "72000000-0000-4000-8000-000000000001";
const call = (body: unknown, origin = "http://localhost") => POST(new Request("http://localhost/api/admin/treasury", {
  method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
}));
const snapshot = { action: "snapshot", id, balance_vnd: 10000, fee_buffer_vnd: 0, as_of: "2026-10-22T00:00:00Z", note: "Confirmed" };
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue(id); insert.mockResolvedValue({ error: null }); rpc.mockResolvedValue({ data: 1, error: null }); });
describe("treasury authorization and writes", () => {
  it("rejects non-admins before reading or writing evidence", async () => {
    auth.mockResolvedValue(null);
    expect((await call(snapshot)).status).toBe(403);
    expect(insert).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes", async () => {
    expect((await call(snapshot, "https://other.test")).status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });
  it("rejects invalid balances", async () => {
    expect((await call({ ...snapshot, balance_vnd: -1 })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
  it("takes audit actor from the authenticated session", async () => {
    expect((await call({ ...snapshot, created_by: "forged" })).status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ created_by: id }));
  });
  it("reports conflicting evidence without overwriting it", async () => {
    rpc.mockResolvedValue({ data: null, error: { hint: "bank_entry_conflict" } });
    expect((await call({ action: "import", source: "bank", csv: `${CSV_HEADER}\nA,in,1,0,2026-10-22T00:00:00Z,,` })).status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
  });
  it("reports inserted and previously imported rows", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    const response = await call({ action: "import", source: "bank", csv: `${CSV_HEADER}\nA,in,1,0,2026-10-22T00:00:00Z,,` });
    expect(response.status).toBe(200); expect((await response.json()).message).toContain("0 dòng mới");
  });
});
