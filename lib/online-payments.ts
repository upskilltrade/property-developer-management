import "server-only";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { retrieveCharge } from "@/lib/omise";

/**
 * Asks Omise for the charge and records the result. Nothing from a webhook body or a browser is
 * trusted: the status, amount and currency come from Omise's API, the charge must carry this
 * online payment's id in its metadata, and the database checks the server-only settle key.
 */
export async function settleFromOmise(chargeId: string, expectedOnlinePaymentId?: string) {
  const charge = await retrieveCharge(chargeId);
  const onlinePaymentId = charge.onlinePaymentId;
  // Charges created elsewhere in the Omise account have no online payment id; nothing to do.
  if (!onlinePaymentId) return null;
  if (expectedOnlinePaymentId && onlinePaymentId !== expectedOnlinePaymentId)
    throw new Error("Charge does not belong to this payment");
  // No user session here (webhooks); the settle key is what authorizes the call.
  const db = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await db.rpc("settle_online_payment", {
    settle_key: process.env.PAYMENT_SETTLE_KEY!,
    target: onlinePaymentId,
    omise_charge: charge.id,
    charge_status: charge.status,
    charge_amount_satang: charge.amount,
    charge_currency: charge.currency,
    paid: charge.paidAt,
    failure: charge.failure,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
