"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, optStr, str, withFlash } from "@/lib/form";
import { designErrorKey } from "@/lib/design";

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
    if (error) redirect(withFlash(back, "error", designErrorKey(error.message)));
    revalidatePath(`/${locale}/app`, "layout");
    redirect(withFlash(to, "saved", key));
  };
  return { supabase, back, finish };
}

export async function createPackage(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("create_design_package", {
    target_project: str(fd, "project_id"),
    data: {
      scope: str(fd, "scope"),
      house_type_id: str(fd, "house_type_id"),
      unit_id: str(fd, "unit_id"),
      code: str(fd, "code"),
      name: str(fd, "name"),
    },
  });
  finish(error, "package");
}

export async function createDrawing(fd: FormData) {
  const { back, supabase, finish } = await context(fd);
  const { data, error } = await supabase.rpc("create_drawing", {
    target_package: str(fd, "package_id"),
    data: {
      discipline: str(fd, "discipline"),
      drawing_no: str(fd, "drawing_no"),
      title: str(fd, "title"),
      customer_visible: fd.get("customer_visible") === "on",
    },
  });
  finish(error, "drawing", data ? `${back.split("?")[0]}/drawings/${data}` : undefined);
}

export async function setCustomerVisible(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("set_drawing_customer_visible", {
    target_drawing: str(fd, "drawing_id"),
    visible: str(fd, "visible") === "true",
  });
  finish(error, "drawing");
}

export async function addRevision(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("add_drawing_revision", {
    target_drawing: str(fd, "drawing_id"),
    file_path: optStr(fd, "file_path"),
    note: optStr(fd, "note"),
  });
  finish(error, "revision");
}

export async function submitRevision(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("submit_drawing_revision", {
    target_revision: str(fd, "revision_id"),
  });
  finish(error, "revision");
}

export async function reviewRevision(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("review_drawing_revision", {
    target_revision: str(fd, "revision_id"),
    approve: str(fd, "decision") === "approve",
    note: optStr(fd, "note"),
  });
  finish(error, "decision");
}

export async function releaseRevision(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("release_drawing_revision", {
    target_revision: str(fd, "revision_id"),
  });
  finish(error, "release");
}

export async function saveMaterial(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("upsert_material", {
    target_org: str(fd, "organization_id"),
    target_material: optStr(fd, "material_id"),
    data: {
      code: str(fd, "code"),
      category: str(fd, "category"),
      name_th: str(fd, "name_th"),
      name_en: str(fd, "name_en"),
      brand: str(fd, "brand"),
      spec: str(fd, "spec"),
      price_delta: str(fd, "price_delta"),
    },
  });
  finish(error, "material");
}

export async function setMaterialImage(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("set_material_image", {
    target_material: str(fd, "material_id"),
    image_path: str(fd, "file_path"),
  });
  finish(error, "material");
}

export async function proposeSelection(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("propose_material_selection", {
    target_unit: str(fd, "unit_id"),
    area: str(fd, "area"),
    target_material: str(fd, "material_id"),
    note: optStr(fd, "note"),
  });
  finish(error, "selection");
}

export async function publishSelection(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("publish_material_selection", {
    target_selection: str(fd, "selection_id"),
  });
  finish(error, "selection");
}
