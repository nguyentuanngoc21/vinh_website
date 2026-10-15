import { describe, expect, it } from "vitest";
import { isGoogleMapsUrl } from "./map-link";
import { parseEventInput } from "./input";
import { mapUrl, type VinhEvent } from "./catalog";

describe("copied Google Maps links", () => {
  it.each([
    "https://maps.app.goo.gl/Abc123?g_st=ic",
    "https://goo.gl/maps/Abc123",
    "https://www.google.com/maps/place/Ho+Chi+Minh/",
    "https://google.com/maps?q=Hanoi",
    "https://www.google.com.vn/maps/search/?api=1&query=Hanoi",
    "https://maps.google.com/?q=Hanoi",
  ])("accepts official Maps URL %s", (url) => expect(isGoogleMapsUrl(url)).toBe(true));
  it.each([
    "javascript:alert(1)", "http://maps.app.goo.gl/abc", "https://evil.test/maps",
    "https://maps.app.goo.gl.evil.test/abc", "https://google.com.evil.test/maps/place/a",
    "https://user:password@www.google.com/maps", "https://www.google.com/url?q=https://evil.test",
    "https://www.google.com/maps-other", "https://goo.gl/not-maps/abc", "https://maps.app.goo.gl/",
    "https://maps.google.com:8080/", "not a link", "https://www.google.com/maps\n?q=Hanoi",
  ])("rejects unsafe or unrelated URL %s", (url) => expect(isGoogleMapsUrl(url)).toBe(false));
  it("opens the copied link for the map and uses the address for travel modes", () => {
    const event = { address: "12 Đường Sách", venue: "Vịnh", city: "Hà Nội", googleMapsUrl: "https://maps.app.goo.gl/Abc123" } as VinhEvent;
    expect(mapUrl(event)).toBe(event.googleMapsUrl);
    const directions = new URL(mapUrl(event, "walking")!);
    expect(directions.hostname).toBe("www.google.com");
    expect(directions.searchParams.get("travelmode")).toBe("walking");
    expect(directions.searchParams.get("destination")).toContain(event.address);
  });
});

const input = {
  title: "Cuộc hẹn ở Vịnh", summary: "Giới thiệu", overview: "Chương trình",
  starts_at: "2026-11-15T14:00:00+07:00", ends_at: "2026-11-15T16:00:00+07:00",
  venue: "Địa điểm", address: "Địa chỉ", city: "Hà Nội", category: "Cộng đồng", price_vnd: 0, status: "draft",
};
describe("event address and organizer updates", () => {
  it("does not store a custom organizer introduction from older clients", () => {
    const result = parseEventInput({ ...input, organizer_bio: "Custom introduction" });
    expect(result).toHaveProperty("data");
    if ("data" in result) expect(result.data).not.toHaveProperty("organizer_bio");
  });
  it("allows an event without a copied map link", () => expect(parseEventInput(input)).toMatchObject({ data: { google_maps_url: null } }));
  it("stores a valid copied link", () => expect(parseEventInput({ ...input, google_maps_url: "https://maps.app.goo.gl/Abc123" })).toMatchObject({ data: { google_maps_url: "https://maps.app.goo.gl/Abc123" } }));
  it("rejects an unrelated link before writing", () => expect(parseEventInput({ ...input, google_maps_url: "https://evil.test" })).toHaveProperty("error"));
  it("normalizes standard HTTPS ports before storing the URL", () => expect(parseEventInput({ ...input, google_maps_url: "https://maps.google.com:443/?q=Hanoi" })).toMatchObject({ data: { google_maps_url: "https://maps.google.com/?q=Hanoi" } }));
});
