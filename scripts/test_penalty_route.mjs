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

const PENALTY_RULES = [
  { percent: 10, durationDays: 3 },
  { percent: 10, durationDays: 7 },
  { percent: 15, durationDays: 14 },
  { percent: 15, durationDays: 30 },
];

function getNextPenalty(count) {
  if (count >= 4) return { ban: true, durationDays: 30 };
  return PENALTY_RULES[count];
}

async function main() {
  // pick a profile to test
  const { data: profiles } = await supabase.from("profiles").select("id, screenshot_penalty_count, token_balance").limit(1);
  if (!profiles || profiles.length === 0) {
    console.error("No profiles found");
    process.exit(1);
  }
  const profile = profiles[0];
  console.log("Profile:", profile);

  const currentCount = Number(profile.screenshot_penalty_count ?? 0);
  const nextCount = currentCount + 1;
  const now = new Date();
  let expiresAt = null;
  let banned = false;
  let lastDeductedAmount = null;

  const nextPenalty = getNextPenalty(currentCount);
  if (nextPenalty.ban) {
    banned = true;
  } else {
    const expires = new Date(now.getTime() + nextPenalty.durationDays * 24 * 60 * 60 * 1000);
    expiresAt = expires.toISOString();
    lastDeductedAmount = Math.max(1, Math.ceil((1000 * nextPenalty.percent) / 100));

    const { data: transaction, error: transactionError } = await supabase.rpc("apply_transaction", {
      p_user_id: profile.id,
      p_type: "screenshot_penalty",
      p_amount: -lastDeductedAmount,
      p_reference_type: "screenshot_penalty",
      p_reference_id: null,
      p_penalty_percent: nextPenalty.percent / 100,
    });

    if (transactionError) {
      console.error("RPC error:", transactionError);
      const missingFn = transactionError.code === "PGRST202" || (typeof transactionError.message === "string" && transactionError.message.includes("p_penalty_percent"));
      if (missingFn) {
        console.log("DB missing new signature — retrying apply_transaction without p_penalty_percent...");
        const fallback = await supabase.rpc("apply_transaction", {
          p_user_id: profile.id,
          p_type: "screenshot_penalty",
          p_amount: -lastDeductedAmount,
          p_reference_type: "screenshot_penalty",
          p_reference_id: null,
        });
        if (fallback.error) {
          console.error("Fallback RPC error:", fallback.error);
          if (typeof fallback.error.message === "string" && fallback.error.message.includes("Insufficient balance")) {
            console.log("Insufficient balance — proceeding to persist penalty state without deduction.");
            lastDeductedAmount = 0;
          } else {
            process.exit(1);
          }
        } else {
          console.log("Transaction created:", fallback.data.id ?? fallback.data);
        }
      } else {
        if (typeof transactionError.message === "string" && transactionError.message.includes("Insufficient balance")) {
          console.log("Insufficient balance — proceeding to persist penalty state without deduction.");
          lastDeductedAmount = 0;
        } else {
          process.exit(1);
        }
      }
    } else {
      console.log("Transaction created:", transaction.id ?? transaction);
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({
      screenshot_penalty_count: nextCount,
      screenshot_penalty_expires_at: expiresAt,
      screenshot_penalty_banned: banned,
      screenshot_penalty_last_offense_at: now.toISOString(),
    })
    .eq("id", profile.id)
    .select("screenshot_penalty_count, screenshot_penalty_expires_at, screenshot_penalty_banned, screenshot_penalty_last_offense_at, token_balance")
    .single();

  if (updateError) {
    console.error("Update error:", updateError);
    process.exit(1);
  }

  console.log("Profile updated:", updated);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
