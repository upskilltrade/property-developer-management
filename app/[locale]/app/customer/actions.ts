"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, num, optStr, str, withFlash } from "@/lib/form";

/** Customer reports a payment with an uploaded slip; Finance verifies it later. */
export async function submitPaymentEvidence(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/customer`;
  const supabase = await createClient();
  const filePath = str(fd, "file_path");
  if (!filePath) redirect(withFlash(back, "error", "evidenceRequired"));
  const { error } = await supabase.rpc("submit_payment_evidence", {
    target_schedule: str(fd, "schedule_id"),
    amount: num(fd, "amount"),
    paid_on: optStr(fd, "paid_on"),
    method: str(fd, "method") || "TRANSFER",
    reference: optStr(fd, "reference"),
    note: optStr(fd, "note"),
    file_path: filePath,
  });
  if (error)
    redirect(
      withFlash(
        back,
        "error",
        error.message.includes("Evidence file") ? "evidenceRequired" : "invalid",
      ),
    );
  revalidatePath(back);
  redirect(withFlash(back, "saved", "evidence"));
}
