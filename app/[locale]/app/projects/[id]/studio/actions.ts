"use server";

import { siteContext } from "@/lib/site-actions";
import { str } from "@/lib/form";

const studioError = (message: string | undefined) => {
  if (!message) return "error";
  if (message.includes("Not authorized")) return "permission";
  if (message.includes("no unit")) return "renderNoUnit";
  return "error";
};
const context = (fd: FormData) =>
  siteContext(fd, (l) => `/${l}/app/projects/${str(fd, "project_id")}/studio`, studioError);

export async function setRenderShared(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("set_render_visibility", {
    target_render: str(fd, "render_id"),
    visible: str(fd, "visible") === "1",
  });
  finish(error, "1");
}

export async function archiveRender(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("archive_render", { target_render: str(fd, "render_id") });
  finish(error, "1");
}
