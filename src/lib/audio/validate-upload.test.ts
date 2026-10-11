import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAudioUpload } from "./validate-upload";
import { AUDIO_MAX_BYTES } from "./upload-rules";

const userId = "test-user";
const path = `${userId}/narration-123-abcdef.mp3`;
function storage(data: unknown, error: unknown = null) {
  const info = vi.fn().mockResolvedValue({ data, error });
  const client = { storage: { from: vi.fn().mockReturnValue({ info }) } };
  return { client: client as unknown as Pick<SupabaseClient, "storage">, info };
}

describe("audio confirmation validates the uploaded Storage object", () => {
  it.each([5 * 1024 * 1024, AUDIO_MAX_BYTES])("accepts valid audio of %i bytes", async (size) => {
    const { client } = storage({ size, contentType: "audio/mpeg" });
    expect(await validateAudioUpload(client, path, userId)).toBeNull();
  });
  it("rejects audio above the limit", async () => {
    const { client } = storage({ size: AUDIO_MAX_BYTES + 1, contentType: "audio/mpeg" });
    expect(await validateAudioUpload(client, path, userId)).toMatchObject({ status: 413 });
  });
  it.each([0, undefined, NaN])("rejects empty or missing size (%s)", async (size) => {
    const { client } = storage({ size, contentType: "audio/mpeg" });
    expect(await validateAudioUpload(client, path, userId)).toMatchObject({ status: 400 });
  });
  it.each(["text/plain", "audio/mp4", undefined])("rejects invalid or mismatched MIME (%s)", async (contentType) => {
    const { client } = storage({ size: 100, contentType });
    expect(await validateAudioUpload(client, path, userId)).toMatchObject({ status: 400 });
  });
  it("rejects a nonexistent upload", async () => {
    const { client } = storage(null);
    expect(await validateAudioUpload(client, path, userId)).toMatchObject({ status: 400 });
  });
  it.each([
    "another-user/narration-123.mp3",
    `${userId}/narration-123/extra.mp3`,
    `${userId}/narration-../other.mp3`,
  ])("rejects unsafe paths without contacting Storage: %s", async (badPath) => {
    const { client, info } = storage({ size: 100, contentType: "audio/mpeg" });
    expect(await validateAudioUpload(client, badPath, userId)).toMatchObject({ status: 400 });
    expect(info).not.toHaveBeenCalled();
  });
});
