"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { aiConfigured, aiErrorKey } from "@/lib/ai";
import { loadControlCenter } from "@/lib/control";
import { formLocale, optStr, withFlash } from "@/lib/form";
import { reviewRisks } from "@/lib/risk-review";

/** Runs an AI risk review over what the person can see and saves it with its cited records. */
export async function runRiskReview(fd: FormData) {
  const locale = formLocale(fd);
  const project = optStr(fd, "project");
  const appBase = `/${locale}/app`;
  const back = `${appBase}/control?view=risks${project ? `&project=${project}` : ""}`;
  const { supabase, isInternal } = await getSession(locale);
  if (!isInternal) redirect(withFlash(back, "error", "permission"));
  if (!aiConfigured()) redirect(withFlash(back, "error", "ai_not_configured"));

  const data = await loadControlCenter(supabase, appBase, project);
  const org = (project ? data.allProjects.find((p) => p.id === project) : data.allProjects[0])
    ?.organization_id;
  if (!org) redirect(withFlash(back, "error", "invalid"));

  let errorKey: string | null = null;
  let usage = { input_tokens: 0, output_tokens: 0 };
  try {
    const result = await reviewRisks(data, appBase);
    usage = result.usage;
    const { error } = await supabase.rpc("save_risk_review", {
      target_org: org,
      target_project: project,
      data: {
        summary_th: result.summary_th,
        summary_en: result.summary_en,
        risks: result.risks,
        discarded: result.discarded,
        record_count: result.records,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      },
    });
    if (error) errorKey = error.message.includes("Not authorized") ? "permission" : "error";
  } catch (e) {
    console.error("risk review failed", e);
    errorKey = `ai_${aiErrorKey(e)}`;
  }
  await supabase.rpc("log_assistant_turn", {
    question_text: `[risk-review] ${project ?? "all projects"}`,
    tools_used: ["risk_review"],
    tokens_in: usage.input_tokens,
    tokens_out: usage.output_tokens,
    stop: errorKey ? "error" : "end_turn",
  });
  if (errorKey) redirect(withFlash(back, "error", errorKey));
  revalidatePath(`${appBase}/control`);
  redirect(withFlash(back, "saved", "risk_review"));
}
