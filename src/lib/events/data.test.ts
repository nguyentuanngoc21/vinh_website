import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ anon: vi.fn(), session: vi.fn(), from: vi.fn(),
  select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(),
  cache: vi.fn((fn: (...args: unknown[]) => unknown) => fn), revalidateTag: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.anon }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.session }));
vi.mock("next/cache", () => ({ unstable_cache: mocks.cache, revalidateTag: mocks.revalidateTag }));
import { getEvents, getPublicEvent } from "./data";
import { revalidatePublicEvents } from "./cache";

const chain = { select: mocks.select, eq: mocks.eq, order: mocks.order,
  limit: mocks.limit, maybeSingle: mocks.maybeSingle };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.anon.mockReturnValue({ from: mocks.from });
  mocks.session.mockResolvedValue({ from: mocks.from });
  mocks.from.mockReturnValue(chain);
  mocks.select.mockReturnValue(chain);
  mocks.eq.mockReturnValue(chain);
  mocks.order.mockReturnValue(chain);
  mocks.limit.mockResolvedValue({ data: [], error: null });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
});

describe("public event reads", () => {
  it("uses an anonymous client and public filters even when a session client exists", async () => {
    expect(await getEvents()).toEqual([]);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.anon).toHaveBeenCalledWith(process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } });
    expect(mocks.eq).toHaveBeenCalledWith("status", "published");
    expect(mocks.eq).toHaveBeenCalledWith("hidden", false);
    expect(mocks.limit).toHaveBeenCalledWith(200);
    expect(mocks.select).not.toHaveBeenCalledWith("*");
  });
  it("throws on database failure rather than caching a successful empty result", async () => {
    mocks.limit.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(getEvents()).rejects.toThrow();
  });
  it("checks detail visibility live and returns null when the event is no longer public", async () => {
    expect(await getPublicEvent("71000000-0000-4000-8000-000000000001")).toBeNull();
    expect(mocks.session).toHaveBeenCalledOnce();
    expect(mocks.anon).not.toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenCalledWith("status", "published");
    expect(mocks.eq).toHaveBeenCalledWith("hidden", false);
  });
  it("does not query malformed event IDs", async () => {
    expect(await getPublicEvent("invalid")).toBeNull();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("expires moderation data immediately instead of stale-while-revalidate", () => {
    revalidatePublicEvents();
    expect(mocks.revalidateTag).toHaveBeenCalledWith("public-events", { expire: 0 });
  });
});
