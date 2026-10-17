import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate } from "@/lib/format";
import { toneOf } from "@/lib/status";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { ProjectForm } from "@/components/domain/project-form";
import { ProjectTabs } from "@/components/domain/project-tabs";
import { updateProject } from "../actions";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { supabase } = await getSession(locale);
  const { data: project } = await supabase
    .from("projects")
    .select("id,code,name,status,target_completion_date")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();
  const base = `/${locale}/app/projects/${id}`;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: t.nav.dashboard, href: `/${locale}/app` },
          { label: t.projects.title, href: `/${locale}/app/projects` },
          { label: project.code },
        ]}
        title={project.name}
        meta={
          <>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-2xs text-ink-2">
              {project.code}
            </span>
            <Badge tone={toneOf(project.status)}>{label(t.status.project, project.status)}</Badge>
          </>
        }
        subtitle={`${t.projects.fields.target}: ${formatDate(locale, project.target_completion_date)}`}
        actions={
          <Sheet
            title={t.projects.edit}
            triggerLabel={t.common.edit}
            triggerIcon={<Pencil />}
            triggerVariant="secondary"
          >
            <ProjectForm t={t} locale={locale} action={updateProject} project={project} />
          </Sheet>
        }
      />
      <div className="mb-4">
        <ProjectTabs
          base={base}
          labels={{
            overview: t.nav.overview,
            schedule: t.nav.schedule,
            photos: t.nav.photos,
            design: t.nav.design,
            site: t.nav.site,
            changes: t.nav.changes,
            procurement: t.nav.procurement,
            handover: t.nav.handover,
            setup: t.nav.setup,
            finance: t.nav.projectFinance,
          }}
        />
      </div>
      {children}
    </>
  );
}
