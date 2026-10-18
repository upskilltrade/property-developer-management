"use server";

import { siteContext } from "@/lib/site-actions";
import { str } from "@/lib/form";
import { standardsErrorKey } from "@/lib/standards";

const errorKey = (m: string | undefined) =>
  standardsErrorKey(m) ?? (m?.includes("Not authorized") ? "permission" : "invalid");
const context = (fd: FormData) => siteContext(fd, (l) => `/${l}/app/settings/standards`, errorKey);

const fields = (fd: FormData) => ({
  id: str(fd, "standard_id"),
  code: str(fd, "code"),
  title: str(fd, "title"),
  issuer: str(fd, "issuer"),
  edition: str(fd, "edition"),
  source_url: str(fd, "source_url"),
  notes: str(fd, "notes"),
  file_path: str(fd, "file_path"),
});

export async function saveStandard(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("save_inspection_standard", {
    target_org: str(fd, "organization_id"),
    data: fields(fd),
  });
  finish(error, "1");
}

export async function setStandardStatus(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("set_standard_status", {
    target_standard: str(fd, "standard_id"),
    new_status: str(fd, "status"),
  });
  finish(error, "1");
}
