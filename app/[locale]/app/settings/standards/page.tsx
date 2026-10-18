import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookCheck, CheckCircle2, ExternalLink, FileText, Pencil, Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDateTime } from "@/lib/format";
import { standardIssuers, standardTone } from "@/lib/standards";
import { scheduleStages } from "@/lib/schedule";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { StorageUploadForm } from "@/components/domain/storage-upload-form";
import { saveStandard, setStandardStatus } from "./actions";

export const metadata: Metadata = { title: "Inspection standards" };

type Standard = {
  id: string;
  code: string;
  title: string;
  issuer: string;
  edition: string | null;
  source_url: string | null;
  file_path: string | null;
  status: string;
  verified_at: string | null;
  notes: string | null;
  doc_type: string;
  project_id: string | null;
  stages: string[];
};

export default async function StandardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  const { supabase, isInternal, access } = await getSession(locale);
  if (!isInternal) redirect(`/${locale}/app/access-denied`);
  const s = t.standards;
  const org = access.find((g) => !["CUSTOMER", "CONTRACTOR", "INVESTOR"].includes(g.role_code))
    ?.organization_id as string;
  const back = `/${locale}/app/settings/standards`;

  const [{ data: rows }, { data: canManage }, { data: projects }] = await Promise.all([
    supabase
      .from("inspection_standards")
      .select(
        "id,code,title,issuer,edition,source_url,file_path,status,verified_at,notes,doc_type,project_id,stages",
      )
      .order("status")
      .order("code"),
    supabase.rpc("can_manage_standards", { target_org: org }),
    supabase.from("projects").select("id,code").order("code"),
  ]);
  const projectCode = new Map((projects ?? []).map((p) => [p.id, p.code]));
  const standards = (rows ?? []) as Standard[];
  const paths = standards.map((x) => x.file_path).filter(Boolean) as string[];
  const { data: signed } = paths.length
    ? await supabase.storage.from("standard-docs").createSignedUrls(paths, 600)
    : { data: [] };
  const urlOf = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const manage = canManage === true;
  const hidden = { locale, organization_id: org, return_to: back };

  const form = (x?: Standard) => (
    <form action={saveStandard} className="space-y-3">
      <Hidden values={{ ...hidden, standard_id: x?.id ?? "" }} />
      <FormGrid>
        <Field label={s.code} required>
          <Input name="code" required defaultValue={x?.code} placeholder={s.codePlaceholder} />
        </Field>
        <Field label={s.issuer} required>
          <Select name="issuer" defaultValue={x?.issuer ?? "DPT"}>
            {standardIssuers.map((i) => (
              <option key={i} value={i}>
                {s.issuers[i]}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <Field label={s.titleField} required>
        <Input name="title" required defaultValue={x?.title} />
      </Field>
      <FormGrid>
        <Field label={s.docType} required>
          <Select name="doc_type" defaultValue={x?.doc_type ?? "STANDARD"}>
            {(["STANDARD", "PROJECT_SPEC", "CONTRACT"] as const).map((d) => (
              <option key={d} value={d}>
                {s.docTypes[d]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={s.project} hint={s.projectRequired}>
          <Select name="project_id" defaultValue={x?.project_id ?? ""}>
            <option value="">{s.allProjects}</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <fieldset>
        <legend className="mb-1 text-2xs font-medium text-ink-2">
          {s.stages} <span className="font-normal text-muted">· {s.allStages}</span>
        </legend>
        <div className="flex flex-wrap gap-3 text-[13px]">
          {scheduleStages.map((st) => (
            <label key={st} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="stages"
                value={st}
                defaultChecked={x?.stages?.includes(st)}
              />
              {t.status.stage[st as keyof typeof t.status.stage] ?? st}
            </label>
          ))}
        </div>
      </fieldset>
      <FormGrid>
        <Field label={s.edition}>
          <Input name="edition" defaultValue={x?.edition ?? ""} />
        </Field>
        <Field label={s.sourceUrl}>
          <Input name="source_url" type="url" defaultValue={x?.source_url ?? ""} />
        </Field>
      </FormGrid>
      <Field label={s.notes}>
        <Textarea name="notes" defaultValue={x?.notes ?? ""} />
      </Field>
      <SheetFooter>
        <SubmitButton>{x ? s.edit : s.add}</SubmitButton>
      </SheetFooter>
    </form>
  );

  return (
    <>
      <PageHeader
        title={s.title}
        subtitle={s.subtitle}
        actions={
          manage ? (
            <Sheet title={s.add} triggerLabel={s.add} triggerIcon={<Plus />}>
              {form()}
            </Sheet>
          ) : null
        }
      />
      <p className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
        <BookCheck className="mt-0.5 size-4 shrink-0" />
        {s.rule}
      </p>
      {!manage ? <p className="mb-4 text-2xs text-muted">{s.viewOnly}</p> : null}
      <Panel>
        {standards.length ? (
          <ul className="divide-y divide-line">
            {standards.map((x) => {
              const doc = x.file_path ? urlOf.get(x.file_path) : null;
              return (
                <li key={x.id} className="space-y-2 px-4 py-3 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{x.code}</span>
                    <span className="min-w-0 flex-1">{x.title}</span>
                    <Badge tone={standardTone[x.status] ?? "neutral"}>
                      {label(s.statuses, x.status)}
                    </Badge>
                  </div>
                  <p className="text-2xs text-muted">
                    {label(s.docTypes, x.doc_type)} · {label(s.issuers, x.issuer)}
                    {x.project_id ? ` · ${projectCode.get(x.project_id) ?? ""}` : ""}
                    {x.stages?.length
                      ? ` · ${x.stages.map((st) => t.status.stage[st as keyof typeof t.status.stage] ?? st).join(", ")}`
                      : ""}
                    {x.edition ? ` · ${s.edition} ${x.edition}` : ""}
                    {x.verified_at && x.status === "VERIFIED"
                      ? ` · ${s.verifiedBy} ${formatDateTime(locale, x.verified_at)}`
                      : ""}
                  </p>
                  {x.notes ? <p className="text-2xs text-ink-2">{x.notes}</p> : null}
                  <div className="flex flex-wrap items-center gap-2 text-2xs">
                    {doc ? (
                      <a
                        href={doc}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                      >
                        <FileText className="size-3.5" />
                        {s.open}
                      </a>
                    ) : (
                      <span className="text-faint">{s.noDocument}</span>
                    )}
                    {x.source_url ? (
                      <a
                        href={x.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand hover:underline"
                      >
                        <ExternalLink className="size-3.5" />
                        {s.sourceUrl}
                      </a>
                    ) : null}
                    {manage ? (
                      <span className="ml-auto flex flex-wrap items-center gap-1.5">
                        <Sheet
                          title={`${s.attach} · ${x.code}`}
                          triggerLabel={s.attach}
                          triggerIcon={<FileText />}
                          triggerVariant="secondary"
                          triggerSize="xs"
                        >
                          <StorageUploadForm
                            action={saveStandard}
                            hidden={{
                              ...hidden,
                              standard_id: x.id,
                              code: x.code,
                              title: x.title,
                              issuer: x.issuer,
                              edition: x.edition ?? "",
                              source_url: x.source_url ?? "",
                              notes: x.notes ?? "",
                              doc_type: x.doc_type,
                              project_id: x.project_id ?? "",
                              stages: JSON.stringify(x.stages ?? []),
                            }}
                            bucket="standard-docs"
                            folder={`${org}/${x.id}`}
                            accept="application/pdf"
                            labels={{
                              file: s.document,
                              submit: s.attach,
                              uploadFailed: t.flash.error,
                            }}
                          />
                        </Sheet>
                        <Sheet
                          title={`${s.edit} · ${x.code}`}
                          triggerLabel={s.edit}
                          triggerIcon={<Pencil />}
                          triggerVariant="ghost"
                          triggerSize="xs"
                        >
                          {form(x)}
                        </Sheet>
                        {x.status !== "VERIFIED" ? (
                          <form action={setStandardStatus}>
                            <Hidden values={{ ...hidden, standard_id: x.id, status: "VERIFIED" }} />
                            <SubmitButton size="xs" variant="success">
                              <CheckCircle2 />
                              {s.verify}
                            </SubmitButton>
                          </form>
                        ) : (
                          <>
                            <form action={setStandardStatus}>
                              <Hidden
                                values={{ ...hidden, standard_id: x.id, status: "UNVERIFIED" }}
                              />
                              <SubmitButton size="xs" variant="ghost">
                                {s.reopen}
                              </SubmitButton>
                            </form>
                            <form action={setStandardStatus}>
                              <Hidden
                                values={{ ...hidden, standard_id: x.id, status: "SUPERSEDED" }}
                              />
                              <SubmitButton size="xs" variant="ghost">
                                {s.supersede}
                              </SubmitButton>
                            </form>
                          </>
                        )}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<BookCheck />} title={s.empty} />
        )}
      </Panel>
    </>
  );
}
