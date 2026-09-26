import { describe, expect, it } from "vitest";
import { parseHeartbeatBody, parseReadingSource } from "./record-heartbeat";
import { readingSourceFromParam } from "./reading-source";

const CH = "11111111-1111-4111-8111-111111111111";
const SS = "22222222-2222-4222-8222-222222222222";

describe("parseHeartbeatBody", () => {
  it("accepts a first heartbeat without session", () => {
    expect(parseHeartbeatBody({ chapterId: CH, paragraphIndex: 0 })).toEqual({ chapterId: CH, sessionId: null, paragraphIndex: 0, source: null });
  });
  it("keeps a valid session id and source", () => {
    expect(parseHeartbeatBody({ chapterId: CH, sessionId: SS, paragraphIndex: 4, source: "contest" }))
      .toEqual({ chapterId: CH, sessionId: SS, paragraphIndex: 4, source: "contest" });
  });
  it("drops an unknown source instead of rejecting", () => {
    expect(parseHeartbeatBody({ chapterId: CH, paragraphIndex: 1, source: "hack" })?.source).toBeNull();
  });
  it.each([
    null,
    "x",
    { chapterId: "nope", paragraphIndex: 0 },
    { chapterId: CH, sessionId: "bad", paragraphIndex: 0 },
    { chapterId: CH, sessionId: 5, paragraphIndex: 0 },
    { chapterId: CH, paragraphIndex: -1 },
    { chapterId: CH, paragraphIndex: 1.5 },
    { chapterId: CH, paragraphIndex: "3" },
    { chapterId: CH },
  ])("rejects %j", (body) => {
    expect(parseHeartbeatBody(body)).toBeNull();
  });
});

describe("reading source", () => {
  it("maps book-page ?from= values", () => {
    expect(readingSourceFromParam("cuoc-thi")).toBe("contest");
    expect(readingSourceFromParam("goi-y")).toBe("recommendation");
    expect(readingSourceFromParam("khac")).toBeNull();
    expect(readingSourceFromParam(undefined)).toBeNull();
  });
  it("only accepts known sources", () => {
    expect(parseReadingSource("search")).toBe("search");
    expect(parseReadingSource("constructor")).toBeNull();
    expect(parseReadingSource(1)).toBeNull();
  });
});
