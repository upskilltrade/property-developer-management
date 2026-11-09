"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, numText, optStr, str, withFlash } from "@/lib/form";
import { specErrorKey } from "@/lib/spec";

async function context(fd: FormData) {
  const locale = formLocale(fd);
  const fallback = `/${locale}/app/projects`;
  const requested = str(fd, "return_to");
  const back = requested.startsWith(fallback) ? requested : fallback;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const finish = (error: { message?: string } | null, key: string, to = back): never => {
    if (error) redirect(withFlash(back, "error", specErrorKey(error.message)));
    revalidatePath(`/${locale}/app`, "layout");
    redirect(withFlash(to, "saved", key));
  };
  return { supabase, back, finish, locale };
}

const textFields = ["area", "name", "description", "brand", "model", "color", "size", "supplier"];

/** Reads the shared item fields; numbers tolerate "1,500", "฿" and Thai digits. */
function fields(fd: FormData, extra: string[] = []) {
  const data: Record<string, string | null> = {};
  for (const k of [...textFields, "unit", "note", ...extra]) data[k] = str(fd, k);
  for (const k of ["quantity", "unit_price", "customer_price"]) {
    if (!fd.has(k)) continue;
    const v = numText(fd, k);
    data[k] = v === null ? "x" : v; // "x" is refused by the RPC as invalid
  }
  return data;
}

export async function saveSpecItem(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("upsert_spec_item", {
    target_project: str(fd, "project_id"),
    target_item: optStr(fd, "item_id"),
    data: {
      ...fields(fd, ["warranty", "house_type_id", "material_id", "seq"]),
      item_no: str(fd, "item_no"),
      category: str(fd, "category"),
    },
  });
  finish(error, "spec");
}

export async function removeSpecItem(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("remove_spec_item", { target_item: str(fd, "item_id") });
  finish(error, "spec");
}

export async function saveSpecOption(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("upsert_spec_option", {
    target_item: str(fd, "item_id"),
    target_option: optStr(fd, "option_id"),
    data: fields(fd),
  });
  finish(error, "spec");
}

export async function removeSpecOption(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("remove_spec_option", {
    target_option: str(fd, "option_id"),
  });
  finish(error, "spec");
}

export async function saveUnitSpec(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("save_unit_spec", {
    target_unit: str(fd, "unit_id"),
    target_line: optStr(fd, "line_id"),
    data: {
      ...fields(fd),
      kind: str(fd, "kind"),
      base_item_id: str(fd, "base_item_id"),
      option_id: str(fd, "option_id"),
      category: str(fd, "category"),
    },
  });
  finish(error, "spec");
}

export async function cancelUnitSpec(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("cancel_unit_spec", { target_line: str(fd, "line_id") });
  finish(error, "spec");
}

export async function createSpecVariation(fd: FormData) {
  const { supabase, finish, locale } = await context(fd);
  const { data, error } = await supabase.rpc("create_spec_variation", {
    target_unit: str(fd, "unit_id"),
    title: str(fd, "title"),
  });
  finish(
    error,
    "variation",
    data ? `/${locale}/app/projects/${str(fd, "project_id")}/changes/${data}` : undefined,
  );
}
