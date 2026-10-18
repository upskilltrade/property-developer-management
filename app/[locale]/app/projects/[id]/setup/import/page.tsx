import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ImportWizard } from "@/components/domain/import-wizard";

/** Legacy data import for a project (owner only); every imported record stays marked as imported. */
export default async function ProjectImport({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { supabase } = await getSession(locale);
  const im = t.importData;

  const { data: project } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", id)
    .single();
  const { data: allowed } = project
    ? await supabase.rpc("can_manage_access", { target_org: project.organization_id })
    : { data: false };
  const { data: batches } = allowed
    ? await supabase
        .from("import_batches")
        .select(
          "id,kind,file_name,row_count,created_at,creator:profiles!import_batches_created_by_fkey(display_name)",
        )
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{im.title}</h2>
          <p className="max-w-3xl text-[13px] text-muted">{im.subtitle}</p>
        </div>
        <Link
          href={`/${locale}/app/projects/${id}/setup`}
          className="inline-flex items-center gap-1 text-[13px] text-brand hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          {t.nav.setup}
        </Link>
      </div>

      {!project || !allowed ? (
        <Panel>
          <EmptyState icon={<ShieldAlert />} title={im.ownerOnly} />
        </Panel>
      ) : (
        <>
          <ul className="list-disc space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 py-2.5 pr-4 pl-8 text-2xs text-amber-900">
            {im.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <ImportWizard
            projectId={id}
            organizationId={project.organization_id}
            locale={locale}
            labels={im.wizard}
          />
          <Panel title={im.history}>
            {batches?.length ? (
              <Table>
                <THead>
                  <tr>
                    <TH>{im.cols.when}</TH>
                    <TH>{im.cols.kind}</TH>
                    <TH>{im.cols.file}</TH>
                    <TH align="right">{im.cols.rows}</TH>
                    <TH>{im.cols.by}</TH>
                  </tr>
                </THead>
                <tbody>
                  {batches.map((b) => (
                    <TR key={b.id}>
                      <TD className="text-muted">{formatDateTime(locale, b.created_at)}</TD>
                      <TD className="font-medium">
                        {label(
                          Object.fromEntries(
                            Object.entries(im.wizard.kinds).map(([k, v]) => [k, v.title]),
                          ),
                          b.kind,
                        )}
                      </TD>
                      <TD className="font-mono text-2xs">{b.file_name ?? "—"}</TD>
                      <TD align="right">{formatNumber(locale, b.row_count)}</TD>
                      <TD className="text-muted">
                        {(b.creator as unknown as { display_name: string | null } | null)
                          ?.display_name ?? "—"}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title={im.noHistory} />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
