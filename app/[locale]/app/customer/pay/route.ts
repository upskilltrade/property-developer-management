import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPromptPayCharge, omiseConfigured } from "@/lib/omise";

/**
 * Starts an Omise PromptPay payment for an installment: reserve it in the database (which checks
 * the person may pay it and the amount), create the charge, attach the charge and its QR link.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "auth" }, { status: 401 });
  if (!omiseConfigured()) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    schedule_id?: string;
    amount?: number;
  } | null;
  const amount = Number(body?.amount);
  if (!body?.schedule_id || !Number.isFinite(amount))
    return Response.json({ error: "invalid" }, { status: 400 });

  const { data: id, error } = await supabase.rpc("begin_online_payment", {
    target_schedule: body.schedule_id,
    pay_amount: Math.round(amount * 100) / 100,
  });
  if (error || !id)
    return Response.json(
      { error: error?.message.includes("Not authorized") ? "permission" : "invalid" },
      { status: 400 },
    );

  try {
    const origin = req.nextUrl.origin;
    const charge = await createPromptPayCharge({
      amount,
      onlinePaymentId: id as string,
      description: `Installment ${body.schedule_id}`,
      returnUri: `${origin}/${locale}/app/customer`,
    });
    const { error: attachError } = await supabase.rpc("attach_online_charge", {
      target: id,
      omise_charge: charge.chargeId,
      qr_uri: charge.qrUri,
      expires: charge.expiresAt,
    });
    if (attachError) throw new Error(attachError.message);
    return Response.json({ id, expires_at: charge.expiresAt, has_qr: Boolean(charge.qrUri) });
  } catch (e) {
    console.error("Omise charge failed", e);
    return Response.json({ error: "provider" }, { status: 502 });
  }
}
