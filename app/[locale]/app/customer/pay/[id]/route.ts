import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { settleFromOmise } from "@/lib/online-payments";

/** Status of one online payment; while pending, asks Omise and records the outcome. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const read = () =>
    supabase
      .from("online_payments")
      .select("id,status,charge_id,amount,expires_at,paid_at")
      .eq("id", id)
      .maybeSingle();
  let { data: row } = await read();
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  if (row.status === "PENDING" && row.charge_id) {
    try {
      await settleFromOmise(row.charge_id, row.id);
      row = (await read()).data ?? row;
    } catch (e) {
      console.error("Omise status check failed", e);
    }
  }
  return Response.json(
    { status: row.status, amount: row.amount, expires_at: row.expires_at, paid_at: row.paid_at },
    { headers: { "cache-control": "no-store" } },
  );
}
