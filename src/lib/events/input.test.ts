import { describe, expect, it } from "vitest";
import { parseEventInput } from "./input";
import { eventDate, eventTime, eventPrice, mapUrl, getFeaturedEvent, type VinhEvent } from "./catalog";
const valid = {
  title: "Cuộc hẹn ở Vịnh", summary: "Một cuộc gặp", overview: "Thông tin chương trình",
  starts_at: "2026-11-15T14:00:00+07:00", ends_at: "2026-11-15T17:00:00+07:00",
  venue: "Không gian Vịnh", address: "12 Đường Sách", city: "Hà Nội", category: "Cộng đồng",
  organizer_bio: "", price_vnd: 0, ticket_url: "", banner_path: "", travel_notes: {}, status: "draft",
};
describe("community event input", () => {
  it("accepts Vietnamese content and a free event", () => {
    expect(parseEventInput(valid)).toMatchObject({ data: { price_vnd: 0, status: "draft", ticket_url: null } });
  });
  it("strips forged owner, moderation and game properties", () => {
    const result = parseEventInput({ ...valid, organizer_id: "someone-else", hidden: false, games: [{ id: "arbitrary" }] });
    expect("data" in result).toBe(true);
    if ("data" in result) for (const key of ["organizer_id", "hidden", "games"]) expect(result.data).not.toHaveProperty(key);
  });
  it.each([-1, 0.5, 100000001, "50000", NaN])("rejects invalid prices: %s", (price_vnd) => {
    expect(parseEventInput({ ...valid, price_vnd })).toHaveProperty("error");
  });
  it("accepts an unannounced price", () => expect(parseEventInput({ ...valid, price_vnd: null })).toHaveProperty("data"));
  it.each(["javascript:alert(1)", "http://tickets.test", "https://user:password@tickets.test", "not a URL"])("rejects unsafe ticket URL %s", (ticket_url) => {
    expect(parseEventInput({ ...valid, ticket_url })).toHaveProperty("error");
  });
  it("accepts HTTPS ticket links", () => expect(parseEventInput({ ...valid, ticket_url: "https://tickets.test/register" })).toHaveProperty("data"));
  it.each(["2026-11-15T13:00:00+07:00", valid.starts_at, "invalid"])("rejects invalid time order %s", (ends_at) => {
    expect(parseEventInput({ ...valid, ends_at })).toHaveProperty("error");
  });
  it("requires an explicit time zone", () => expect(parseEventInput({ ...valid, starts_at: "2026-11-15T14:00" })).toHaveProperty("error"));
  it("rejects oversized content", () => expect(parseEventInput({ ...valid, overview: "x".repeat(20001) })).toHaveProperty("error"));
  it("rejects oversized travel notes", () => expect(parseEventInput({ ...valid, travel_notes: { driving: "x".repeat(1001) } })).toHaveProperty("error"));
});
describe("event presentation", () => {
  it("uses Vietnamese time independently of the server timezone", () => {
    expect(eventTime("2026-11-14T23:00:00Z")).toBe("06:00");
    expect(eventDate("2026-11-14T23:00:00Z")).toContain("15");
  });
  it("distinguishes free, paid and unannounced tickets", () => {
    expect(eventPrice({ priceVnd: 0 })).toBe("Miễn phí");
    expect(eventPrice({ priceVnd: null })).toContain("công bố");
    expect(eventPrice({ priceVnd: 50000 })).toContain("50.000");
  });
  it("does not pick a featured event implicitly", () => expect(getFeaturedEvent([{ slug: "not-featured" } as VinhEvent])).toBeUndefined());
  it("encodes the address and selected transport mode in Maps links", () => {
    const event = { venue: "Vịnh & Sách", address: "12 Đường Sách", city: "Hà Nội" } as VinhEvent;
    const url = new URL(mapUrl(event, "walking")!);
    expect(url.hostname).toBe("www.google.com");
    expect(url.searchParams.get("travelmode")).toBe("walking");
    expect(url.searchParams.get("destination")).toBe("Vịnh & Sách, 12 Đường Sách, Hà Nội");
    expect(new URL(mapUrl(event)!).searchParams.get("query")).toContain("Hà Nội");
  });
});
