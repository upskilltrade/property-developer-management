import type { NextRequest } from "next/server";
import { omiseConfigured } from "@/lib/omise";
import { settleFromOmise } from "@/lib/online-payments";

/**
 * Omise webhook endpoint. The body is used only to learn which charge changed; its content is not
 * trusted. The charge is retrieved from Omise and recorded through settleFromOmise.
 */
export async function POST(req: NextRequest) {
  if (!omiseConfigured()) return new Response("Not configured", { status: 503 });
  const body = (await req.json().catch(() => null)) as {
    object?: string;
    id?: string;
    data?: { object?: string; id?: string };
  } | null;
  // Only the charge id is taken from the body (an event carries the charge in data); everything
  // else comes from Omise's API.
  const chargeId = [body?.data?.id, body?.id].find(
    (v) => typeof v === "string" && /^chrg_\w+$/.test(v),
  );
  if (!chargeId || !/^chrg_[A-Za-z0-9_]+$/.test(chargeId))
    return new Response("Ignored", { status: 200 });
  try {
    await settleFromOmise(chargeId);
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("Omise webhook settle failed", e);
    // A non-2xx answer lets Omise deliver the event again later.
    return new Response("Retry", { status: 500 });
  }
}
