import fs from "fs";
import path from "path";

function loadEnv(file) {
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    process.env[key] = val;
  }
}

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) loadEnv(envPath);

const { createClient } = await import("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase env vars.");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data: profiles, error: pError } = await supabase.from("profiles").select("id, token_balance").limit(1);
  if (pError) {
    console.error("Failed to read profiles:", pError);
    process.exit(1);
  }
  if (!profiles || profiles.length === 0) {
    console.error("No profiles found to test with.");
    process.exit(1);
  }
  const userId = profiles[0].id;
  console.log("Using user:", userId, "balance:", profiles[0].token_balance);

  // Try screenshot_penalty first; if enum not present, fall back to admin_adjustment
  let { data, error } = await supabase.rpc("apply_transaction", {
    p_user_id: userId,
    p_type: "screenshot_penalty",
    p_amount: -1,
    p_reference_type: "screenshot_penalty",
    p_reference_id: null,
    p_penalty_percent: 0,
  });
  if (error) {
    console.error("Initial RPC error:", error);
    const missingFn = error.code === "PGRST202" || (error.message && error.message.includes("p_penalty_percent"));
    if (missingFn) {
      console.log("DB function missing new signature — retrying without p_penalty_percent...");
      const fallback = await supabase.rpc("apply_transaction", {
        p_user_id: userId,
        p_type: "screenshot_penalty",
        p_amount: -1,
        p_reference_type: "screenshot_penalty",
        p_reference_id: null,
      });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      if (error.code === "22P02") {
        console.log("Enum 'screenshot_penalty' missing in DB, retrying with 'admin_adjustment' to validate RPC path...");
        const res = await supabase.rpc("apply_transaction", {
          p_user_id: userId,
          p_type: "admin_adjustment",
          p_amount: -1,
          p_reference_type: "test",
          p_reference_id: null,
          p_penalty_percent: 0,
        });
        data = res.data;
        error = res.error;

        if (error) {
          console.error("Fallback RPC error:", error);
          // If insufficient balance, top up then retry a deduction to validate full flow
          if (error.message && error.message.includes("Insufficient balance")) {
            console.log("Topping up user by 100 tokens to test deduction flow...");
            const topup = await supabase.rpc("apply_transaction", {
              p_user_id: userId,
              p_type: "admin_adjustment",
              p_amount: 100,
              p_reference_type: "test_topup",
              p_reference_id: null,
              p_penalty_percent: 0,
            });
            if (topup.error) {
              console.error("Topup RPC error:", topup.error);
              process.exit(1);
            }
            console.log("Topup result:", topup.data);

            const deduct = await supabase.rpc("apply_transaction", {
              p_user_id: userId,
              p_type: "admin_adjustment",
              p_amount: -1,
              p_reference_type: "test_deduct",
              p_reference_id: null,
              p_penalty_percent: 0,
            });
            if (deduct.error) {
              console.error("Deduct RPC error:", deduct.error);
              process.exit(1);
            }
            console.log("Deduct RPC result:", deduct.data);
          } else {
            process.exit(1);
          }
        } else {
          console.log("Fallback RPC result:", data);
        }
      } else {
        process.exit(1);
      }
    } else {
      console.log("RPC result:", data);
    }
  } else {
    console.log("RPC result:", data);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
