import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, FileText, Lock, Upload } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDateTime } from "@/lib/format";
import { revisionTone } from "@/lib/design";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { Field, Hidden, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { StorageUploadForm } from "@/components/domain/storage-upload-form";
import {
  addRevision,
  releaseRevision,
  reviewRevision,
  setCustomerVisible,
  submitRevision,
} from "../../actions";

export const metadata: Metadata = { title: "Drawing" };

/** One drawing: revision history with the workflow actions, and customer approvals per revision. */
export default async function DrawingDetail({
  params,
}: {
  params: Promise<{ locale: string; id: string; drawingId: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id, drawingId } = await params;
  const { supabase } = await getSession(locale);
  const d = t.design;
  const base = `/${locale}/app/projects/${id}/design`;
  const back = `${base}/drawings/${drawingId}`;

  const { data: drawing } = await supabase
    .from("drawings")
    .select("*,design_packages(code,name,scope)")
    .eq("id", drawingId)
    .eq("project_id", id)
    .maybeSingle();
  if (!drawing) notFound();
  const [{ data: revisions }, { data: approvals }] = await Promise.all([
    supabase
      .from("drawing_revisions")
      .select(
        "*,author:profiles!drawing_revisions_created_by_fkey(display_name),reviewer:profiles!drawing_revisions_reviewed_by_fkey(display_name)",
      )
      .eq("drawing_id", drawingId)
      .order("seq", { ascending: false }),
    supabase
      .from("customer_approvals")
      .select("id,entity_id,entity_label,decision,comment,decided_at")
      .eq("entity_type", "DRAWING_REVISION")
      .order("decided_at", { ascending: false }),
  ]);
  const revIds = new Set((revisions ?? []).map((r) => r.id));
  const myApprovals = (approvals ?? []).filter((a) => revIds.has(a.entity_id));
  const paths = (revisions ?? []).map((r) => r.file_path);
  const { data: signed } = paths.length
    ? await supabase.storage.from("design-files").createSignedUrls(paths, 600)
    : { data: [] };
  const url = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const pkg = one(drawing.design_packages);
  const hasOpen = (revisions ?? []).some((r) =>
    ["DRAFT", "IN_REVIEW", "APPROVED"].includes(r.status),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={base} className={buttonClass("ghost", "sm", "-ml-2 px-2")}>
          <ArrowLeft />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">
            <span className="font-mono">{drawing.drawing_no}</span> · {drawing.title}
          </h2>
          <p className="text-2xs text-muted">
            {label(t.status.discipline, drawing.discipline)} · {pkg?.code} {pkg?.name}
          </p>
        </div>
        <form action={setCustomerVisible}>
          <Hidden
            values={{
              locale,
              return_to: back,
              drawing_id: drawing.id,
              visible: String(!drawing.customer_visible),
            }}
          />
          <SubmitButton variant="secondary">
            {drawing.customer_visible ? <EyeOff /> : <Eye />}
            {drawing.customer_visible ? d.hideCustomer : d.showCustomer}
          </SubmitButton>
        </form>
        {!hasOpen ? (
          <Sheet
            title={d.newRevision}
            description={d.newRevisionHint}
            triggerLabel={d.newRevision}
            triggerIcon={<Upload />}
          >
            <StorageUploadForm
              action={addRevision}
              hidden={{ locale, return_to: back, drawing_id: drawing.id }}
              bucket="design-files"
              folder={`${drawing.organization_id}/${drawing.project_id}/${drawing.package_id}/${drawing.id}`}
              accept="application/pdf,image/*"
              labels={{
                file: d.file,
                submit: d.newRevision,
                uploadFailed: d.uploadFailed,
                hint: d.newRevisionHint,
              }}
            >
              <Field label={d.note}>
                <Textarea name="note" />
              </Field>
            </StorageUploadForm>
          </Sheet>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={d.revisions} className="lg:col-span-2">
          {revisions?.length ? (
            <ol className="divide-y divide-line">
              {revisions.map((r) => {
                const released = r.status === "RELEASED";
                return (
                  <li
                    key={r.id}
                    className={cn("space-y-2 px-4 py-3", released && "bg-emerald-50/60")}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[15px] font-semibold">
                        {d.revision} {r.revision_code}
                      </span>
                      <Badge tone={revisionTone[r.status] ?? "neutral"}>
                        {released ? <Lock className="size-3" /> : null}
                        {label(t.status.drawingStatus, r.status)}
                      </Badge>
                      <span className="ml-auto text-2xs text-muted">
                        {formatDateTime(locale, r.created_at)} · {d.by}{" "}
                        {one(r.author)?.display_name ?? "—"}
                      </span>
                    </div>
                    {r.note ? <p className="text-[13px] text-ink-2">{r.note}</p> : null}
                    {r.reviewed_at ? (
                      <p className="text-2xs text-muted">
                        {d.reviewNote}: {r.review_note ?? "—"} · {one(r.reviewer)?.display_name} ·{" "}
                        {formatDateTime(locale, r.reviewed_at)}
                      </p>
                    ) : null}
                    {r.released_at ? (
                      <p className="text-2xs text-emerald-700">
                        {label(t.status.drawingStatus, "RELEASED")}{" "}
                        {formatDateTime(locale, r.released_at)}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      {url.get(r.file_path) ? (
                        <a
                          href={url.get(r.file_path)!}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonClass("secondary", "xs")}
                        >
                          <FileText />
                          {d.openFile}
                        </a>
                      ) : null}
                      {r.status === "DRAFT" ? (
                        <form action={submitRevision}>
                          <Hidden values={{ locale, return_to: back, revision_id: r.id }} />
                          <SubmitButton size="xs">{d.submit}</SubmitButton>
                        </form>
                      ) : null}
                      {r.status === "IN_REVIEW" ? (
                        <form action={reviewRevision} className="flex flex-wrap items-center gap-1">
                          <Hidden values={{ locale, return_to: back, revision_id: r.id }} />
                          <Input
                            name="note"
                            placeholder={d.reviewNote}
                            className="h-6 w-44 text-2xs"
                          />
                          <SubmitButton size="xs" variant="success" name="decision" value="approve">
                            {d.approve}
                          </SubmitButton>
                          <SubmitButton size="xs" variant="danger" name="decision" value="reject">
                            {d.reject}
                          </SubmitButton>
                        </form>
                      ) : null}
                      {r.status === "APPROVED" ? (
                        <form action={releaseRevision} className="flex items-center gap-2">
                          <Hidden values={{ locale, return_to: back, revision_id: r.id }} />
                          <SubmitButton size="xs" variant="success">
                            {d.release}
                          </SubmitButton>
                          <span className="text-2xs text-muted">{d.releaseHint}</span>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="px-4 py-8 text-center text-2xs text-faint">{d.noneReleased}</p>
          )}
        </Panel>

        <Panel title={d.customerApprovals}>
          {myApprovals.length ? (
            <ul className="divide-y divide-line">
              {myApprovals.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-[13px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px]">{a.entity_label}</span>
                    <Badge
                      tone={a.decision === "APPROVED" ? "success" : "danger"}
                      className="ml-auto"
                    >
                      {label(t.status.decision, a.decision)}
                    </Badge>
                  </div>
                  {a.comment ? <p className="mt-0.5 text-ink-2">{a.comment}</p> : null}
                  <p className="text-2xs text-muted">{formatDateTime(locale, a.decided_at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-2xs text-faint">{d.noApprovals}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
