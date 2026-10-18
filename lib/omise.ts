import "server-only";
import Omise from "omise";

/**
 * Omise (Opn Payments) through the official omise-node SDK. Every call shape here follows that
 * SDK's README and type definitions: amounts are in satang ("100000 // 1,000 Baht"), a source is
 * created with the public key and then charged with the secret key.
 */
export const omiseConfigured = () =>
  Boolean(
    process.env.OMISE_SECRET_KEY && process.env.OMISE_PUBLIC_KEY && process.env.PAYMENT_SETTLE_KEY,
  );

const client = () =>
  Omise({
    secretKey: process.env.OMISE_SECRET_KEY!,
    publicKey: process.env.OMISE_PUBLIC_KEY!,
    // The API version used in the SDK README.
    omiseVersion: "2019-05-29",
    // Test-only override (with the SDK's own OMISE_SCHEME); unset means api.omise.co over https.
    ...(process.env.OMISE_API_HOST ? { host: process.env.OMISE_API_HOST } : {}),
  });

export const toSatang = (baht: number) => Math.round(baht * 100);

/** A PromptPay charge for one online payment; its id travels in metadata to tie it back. */
export async function createPromptPayCharge(input: {
  amount: number;
  onlinePaymentId: string;
  description: string;
  returnUri: string;
}) {
  const omise = client();
  const amount = toSatang(input.amount);
  const source = await omise.sources.create({ type: "promptpay", amount, currency: "thb" });
  const charge = await omise.charges.create({
    amount,
    currency: "thb",
    source: source.id,
    return_uri: input.returnUri,
    description: input.description.slice(0, 255),
    metadata: { online_payment_id: input.onlinePaymentId },
  });
  return {
    chargeId: charge.id,
    status: charge.status,
    qrUri: charge.source?.scannable_code?.image?.download_uri ?? null,
    expiresAt: charge.expires_at ?? null,
  };
}

export async function retrieveCharge(chargeId: string) {
  const charge = await client().charges.retrieve(chargeId);
  return {
    id: charge.id,
    status: charge.status,
    amount: charge.amount,
    currency: charge.currency,
    paidAt: charge.paid_at ?? null,
    failure: charge.failure_message ?? null,
    onlinePaymentId: (charge.metadata?.online_payment_id as string | undefined) ?? null,
  };
}

/** Fetches the charge's QR image from Omise with the secret key, for our own image route. */
export async function fetchQrImage(uri: string) {
  const u = new URL(uri);
  if (u.protocol !== "https:" || !/(^|\.)omise\.co$/.test(u.hostname)) return null;
  const res = await fetch(u, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.OMISE_SECRET_KEY}:`).toString("base64")}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return {
    body: await res.arrayBuffer(),
    type: res.headers.get("content-type") ?? "image/svg+xml",
  };
}
