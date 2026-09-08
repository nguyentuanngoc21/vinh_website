import crypto from "crypto";
import type { DepositGatewayAdapter, NormalizedDepositEvent } from "@/lib/wallet/deposit-service";

/**
 * ZaloPay Open API v2 — deposit (collect payment) side only.
 * Docs: https://docs.zalopay.vn/en/v2/general/overview.html
 * Sandbox test wallets: https://docs.zalopay.vn/vi/docs/developer-tools/test-instructions/test-wallets
 * Merchant config (callback URL, app id/keys): https://sbmc.zalopay.vn/
 *
 * Credentials come from env only — see .env.example. This file throws if
 * ZALOPAY_APP_ID/KEY1 are missing when actually creating an order, but
 * verifyAndParse() below fails closed (returns null) instead, since it
 * runs on an unauthenticated webhook path.
 */

const BASE_URL =
  process.env.ZALOPAY_ENV === "production" ? "https://openapi.zalopay.vn/v2" : "https://sb-openapi.zalopay.vn/v2";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} — set it in .env.local (see .env.example).`);
  return value;
}

function hmacSha256Hex(key: string, data: string): string {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

/** Constant-time hex compare — a plain !== leaks timing info about how many
 * leading bytes matched, which is exactly what an attacker forging a
 * callback mac would probe for. */
function macEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** ZaloPay requires app_trans_id to be prefixed "yyMMdd_" (their dedup key
 * is per-day) — the rest just needs to be unique within that day. */
function newAppTransId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}_${crypto.randomInt(100_000, 999_999)}`;
}

export type CreateOrderParams = {
  /** Our own user id, echoed back by ZaloPay — no format requirement on their side. */
  appUser: string;
  amountVnd: number;
  description: string;
};

export type CreateOrderResult = { ok: true; appTransId: string; orderUrl: string } | { ok: false; error: string };

/**
 * Calls ZaloPay's CreateOrder API (POST /v2/create). The caller must persist
 * the returned appTransId as gatewayOrderId (DepositService.createOrder)
 * BEFORE redirecting the user to orderUrl — see deposit route handler.
 */
export async function createZalopayOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const app_id = requireEnv("ZALOPAY_APP_ID");
  const key1 = requireEnv("ZALOPAY_KEY1");

  const app_trans_id = newAppTransId();
  const app_time = Date.now();
  const embed_data = "{}";
  const item = "[]";
  const amount = Math.round(params.amountVnd);

  if (amount <= 0) return { ok: false, error: "Invalid amount" };

  // Mac formula per ZaloPay docs: HMAC-SHA256(key1, app_id|app_trans_id|
  // app_user|amount|app_time|embed_data|item) — field order matters.
  const data = `${app_id}|${app_trans_id}|${params.appUser}|${amount}|${app_time}|${embed_data}|${item}`;
  const mac = hmacSha256Hex(key1, data);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        app_id,
        app_user: params.appUser,
        app_trans_id,
        app_time: String(app_time),
        amount: String(amount),
        item,
        description: params.description,
        embed_data,
        mac,
      }),
    });
  } catch (err) {
    return { ok: false, error: `ZaloPay request failed: ${(err as Error).message}` };
  }

  const json = await res.json().catch(() => null);
  // return_code 1 = success per ZaloPay's convention (2 = pending, other = failed).
  if (!json || json.return_code !== 1 || typeof json.order_url !== "string") {
    return { ok: false, error: json?.sub_return_message || json?.return_message || "ZaloPay createOrder failed" };
  }
  return { ok: true, appTransId: app_trans_id, orderUrl: json.order_url };
}

/**
 * ZaloPay's server-to-server callback posts { data, mac } where `data` is
 * itself a JSON string; mac = HMAC-SHA256(key2, data). Must verify before
 * trusting anything inside `data` — this is the one place a forged request
 * could otherwise credit tokens nobody paid for.
 *
 * ZaloPay only calls back on successful payment (no separate "failed"
 * event — an abandoned/expired order simply never calls back), so a
 * verified callback here always maps to status: "success".
 */
export const zalopayGatewayAdapter: DepositGatewayAdapter = {
  name: "zalopay",
  verifyAndParse(rawBody): NormalizedDepositEvent | null {
    const key2 = process.env.ZALOPAY_KEY2;
    if (!key2) {
      console.error("[wallet] zalopay webhook received but ZALOPAY_KEY2 is not configured — rejecting");
      return null;
    }

    let body: { data?: unknown; mac?: unknown };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (typeof body.data !== "string" || typeof body.mac !== "string") return null;

    const expectedMac = hmacSha256Hex(key2, body.data);
    if (!macEquals(expectedMac, body.mac)) return null;

    let inner: { app_trans_id?: unknown; amount?: unknown };
    try {
      inner = JSON.parse(body.data);
    } catch {
      return null;
    }
    if (typeof inner.app_trans_id !== "string" || typeof inner.amount !== "number") return null;

    return { gatewayOrderId: inner.app_trans_id, status: "success", amountVnd: inner.amount };
  },
};
