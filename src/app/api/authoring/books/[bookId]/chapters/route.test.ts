import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(), agreement: vi.fn(), cache: vi.fn(), reward: vi.fn(),
}));
vi.mock("@/lib/mobile/request-context", () => ({ getUserContext: mocks.context, requestError: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/authoring/exclusivity-agreement", () => ({
  hasAcceptedExclusivityPolicy: mocks.agreement,
  EXCLUSIVITY_AGREEMENT_ERROR: "agreement required", EXCLUSIVITY_AGREEMENT_ID: "exclusive",
}));
vi.mock("@/lib/cache/public-data", () => ({ revalidatePublicBooks: mocks.cache }));
vi.mock("@/lib/quests/reward-engine", () => ({ RewardEngine: { incrementTaskProgress: mocks.reward } }));
vi.mock("@/lib/contests/trigger-errors", () => ({ contestLockResponse: () => null }));

import { PATCH } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const book = { id: "book", author_id: "author", is_exclusive: false, deleted_at: null };

function database(results: unknown[]) {
  const update = vi.fn();
  const chains: Record<string, ReturnType<typeof vi.fn>>[] = [];
  const from = vi.fn(() => {
    const result = results.shift();
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const key of ["select", "eq", "in", "is", "maybeSingle"]) chain[key] = vi.fn(() => chain);
    chain.update = vi.fn((value) => { update(value); return chain; });
    chain.then = vi.fn((resolve) => Promise.resolve(result).then(resolve));
    chains.push(chain);
    return chain;
  });
  mocks.context.mockResolvedValue({ userId: "author", supabase: { from }, admin: () => ({}) });
  return { update, from, chains };
}

function publish(ids: unknown = [id], price?: unknown) {
  return PATCH(new Request("http://localhost/api/authoring/books/book/chapters", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIds: ids, price }),
  }), { params: Promise.resolve({ bookId: "book" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.agreement.mockResolvedValue(true);
  mocks.reward.mockResolvedValue({ ok: true });
});

describe("bulk chapter publication", () => {
  it("rejects invalid prices before accessing the database", async () => {
    for (const price of [-1, 0.5, "100", 2147483648]) expect((await publish([id], price)).status).toBe(400);
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("sets the selected price together with publication", async () => {
    const db = database([{ data: book }, { data: [{ id, removed_at: null }] }, { data: [{ id }] }, { error: null }]);
    expect((await publish([id], 0)).status).toBe(200);
    expect(db.chains[2].update).toHaveBeenCalledWith({ published: true, price: 0 });
  });
  it("rejects duplicate chapter IDs before accessing the database", async () => {
    expect((await publish([id, id])).status).toBe(400);
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    mocks.context.mockResolvedValue({ userId: null });
    expect((await publish()).status).toBe(401);
  });
  it("rejects another author's book without writes", async () => {
    const db = database([{ data: { ...book, author_id: "someone-else" } }]);
    expect((await publish()).status).toBe(404);
    expect(db.update).not.toHaveBeenCalled();
  });
  it("blocks exclusive publication until the agreement is accepted", async () => {
    const db = database([{ data: { ...book, is_exclusive: true } }]);
    mocks.agreement.mockResolvedValue(false);
    const response = await publish();
    expect(response.status).toBe(403);
    expect((await response.json()).missingAgreementIds).toEqual(["exclusive"]);
    expect(db.update).not.toHaveBeenCalled();
  });
  it("rejects missing chapters and moderated chapters before writing", async () => {
    for (const chapters of [[], [{ id, removed_at: "2026-10-01" }]]) {
      const db = database([{ data: book }, { data: chapters }]);
      expect((await publish()).status).toBe(chapters.length ? 403 : 409);
      expect(db.update).not.toHaveBeenCalled();
    }
  });
  it("publishes the complete selection with one chapter update and counts only transitions", async () => {
    const db = database([
      { data: book }, { data: [{ id, removed_at: null }, { id: secondId, removed_at: null }] },
      { data: [{ id }, { id: secondId }] }, { error: null },
    ]);
    const response = await publish([id, secondId]);
    expect(response.status).toBe(200);
    expect((await response.json()).publishedCount).toBe(2);
    expect(db.update).toHaveBeenCalledTimes(2); // chapters, then parent book
    expect(db.chains[2].in).toHaveBeenCalledWith("id", [id, secondId]);
    expect(db.chains[2].eq).toHaveBeenCalledWith("published", false);
    expect(db.chains[2].is).toHaveBeenCalledWith("removed_at", null);
    expect(mocks.reward).toHaveBeenCalledWith({}, { userId: "author", taskCode: "author_publish_chapter", amount: 2 });
    expect(mocks.cache).toHaveBeenCalledOnce();
  });
  it("allows a retry to repair book visibility without counting rewards again", async () => {
    database([{ data: book }, { data: [{ id, removed_at: null }] }, { data: [] }, { error: null }]);
    expect((await publish()).status).toBe(200);
    expect(mocks.reward).not.toHaveBeenCalled();
  });
  it("does not publish the parent book if the chapter update fails", async () => {
    const db = database([{ data: book }, { data: [{ id, removed_at: null }] }, { error: { code: "failure" } }]);
    expect((await publish()).status).toBe(500);
    expect(db.update).toHaveBeenCalledOnce();
    expect(mocks.reward).not.toHaveBeenCalled();
  });
  it("reports incomplete book visibility so the client can retry", async () => {
    database([{ data: book }, { data: [{ id, removed_at: null }] }, { data: [{ id }] }, { error: { code: "failure" } }]);
    const response = await publish();
    expect(response.status).toBe(500);
    expect((await response.json()).chapterIds).toEqual([id]);
  });
});
