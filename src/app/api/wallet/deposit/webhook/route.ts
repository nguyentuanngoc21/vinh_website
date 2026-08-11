import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { DepositService } from "@/lib/wallet/deposit-service";

/**
 * Generic, gateway-agnostic deposit webhook — see the adapter note in
 * deposit-service.ts. ?gateway= selects which DepositGatewayAdapter
 * verifies/parses the body; only 'stub' exists today. Once a real gateway
 * is chosen, point its webhook URL here with ?gateway=<name> and add the
 * matching adapter — this route itself doesn't need to change.
 *
 * No caller auth on this route by design (payment gateways don't send our
 * session cookie) — trust instead comes from the adapter's signature
 * verification. Never skip that step when wiring up a real gateway.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const gateway = url.searchParams.get("gateway") ?? "stub";
  const rawBody = await request.text();

  const supabase = createServiceRoleClient();

  let result;
  try {
    result = await DepositService.handleWebhook(supabase, gateway, rawBody, request.headers);
  } catch (err) {
    console.error("[wallet] deposit webhook failed:", err);
    // 500 so the gateway retries — the credit was reverted to 'pending'
    // for exactly this reason, see deposit-service.ts.
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, alreadyProcessed: result.alreadyProcessed });
}
