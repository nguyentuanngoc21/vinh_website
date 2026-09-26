import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit test cho logic thuần (không gọi Supabase) — xem docs/DEV_WORKFLOW.md.
// Mọi thứ cần DB được test bằng SQL test script trong docs/supabase/tests/.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
