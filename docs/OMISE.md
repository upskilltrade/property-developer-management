# Online payment with Omise (PromptPay)

Customers pay an installment by scanning a PromptPay QR issued by Omise (Opn Payments). When Omise
reports the charge paid, the payment and its receipt are recorded automatically; no slip is needed.

## Sources used

The integration follows the official Node SDK `omise` (omise-node 1.1.0): its README and type
definitions (`node_modules/omise/types/index.d.ts`). From there:

- amounts are in satang (`'100000', // 1,000 Baht`), currency `thb`;
- a source is created with the **public** key (`sources.create({ type, amount, currency })`) and
  then charged with the **secret** key (`charges.create({ amount, currency, source, return_uri, metadata })`);
- a charge has `status` `pending | successful | failed | expired | reversed`, `paid_at`, `metadata`,
  and for QR sources `source.scannable_code.image.download_uri`;
- API version header `2019-05-29` as in the README.

Omise's documentation site was not reachable from the build environment, so nothing beyond the
SDK was assumed. In particular the webhook body is **not** parsed for status or amount (see below).

## How it works

1. Customer presses **ชำระออนไลน์** on an installment → `begin_online_payment` reserves it
   (checks the person may pay it and the amount ≤ outstanding).
2. The server creates the PromptPay source and charge, with `metadata.online_payment_id`, and
   stores the charge id and the QR's link (`attach_online_charge`). The QR image is never stored;
   `/[locale]/app/customer/pay/[id]/qr` fetches it from Omise on demand.
3. The page polls `/[locale]/app/customer/pay/[id]`; Omise also calls the webhook.
4. Either way the server **retrieves the charge from Omise with the secret key**, checks that its
   metadata names this online payment, and calls `settle_online_payment` with the server-only
   settle key. The database checks the key, the charge id, the amount (in satang) and the currency,
   then records one payment (receipt `RC-…`, reference `Omise PromptPay chrg_…`). Repeats are no-ops.

## Setup

1. In the Omise dashboard, enable **PromptPay** for the account and copy the keys.
2. In Vercel → Environment Variables:
   - `OMISE_PUBLIC_KEY` = `pkey_…`
   - `OMISE_SECRET_KEY` = `skey_…`
   - `PAYMENT_SETTLE_KEY` = a long random string (e.g. `openssl rand -hex 32`)
3. In Supabase → SQL editor, store the same settle key in Vault:
   `select vault.create_secret('<the PAYMENT_SETTLE_KEY value>', 'payment_settle_key');`
4. In the Omise dashboard → Webhooks, set the endpoint to `https://<your-domain>/th/omise/webhook`.
5. Test with test keys first (`pkey_test_…` / `skey_test_…`) and a small amount, then switch to live keys.

The "ชำระออนไลน์" button appears only when all three variables are set; otherwise the portal keeps
the bank-transfer and PromptPay-QR-with-slip flow.

`OMISE_API_HOST` (with the SDK's own `OMISE_SCHEME`) exists only to point the SDK at a fake server
in tests; leave both unset in production.
