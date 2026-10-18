import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchQrImage } from "@/lib/omise";

/**
 * The PromptPay QR for one online payment, fetched from Omise on demand. Only its link is stored;
 * RLS limits the row to the unit's customer and project staff.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("online_payments")
    .select("status,qr_image_uri")
    .eq("id", id)
    .maybeSingle();
  if (!row?.qr_image_uri || row.status !== "PENDING")
    return new Response("Not found", { status: 404 });
  const image = await fetchQrImage(row.qr_image_uri).catch(() => null);
  if (!image) return new Response("Unavailable", { status: 502 });
  return new Response(image.body, {
    headers: { "content-type": image.type, "cache-control": "private, no-store" },
  });
}
