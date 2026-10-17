import { CheckCircle2, FileText, MessageSquareWarning } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import type { Locale } from "@/lib/i18n/config";
import { label } from "@/lib/i18n/label";
import { formatDate } from "@/lib/format";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Hidden, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export type CustomerDrawing = {
  revisionId: string;
  drawingNo: string;
  title: string;
  discipline: string;
  revisionCode: string;
  releasedAt: string | null;
  url: string | null;
};
export type CustomerSelection = {
  id: string;
  unitCode: string;
  area: string;
  version: number;
  status: string;
  material: string;
  brand: string | null;
  imageUrl: string | null;
};
export type CustomerDecision = {
  entityId: string;
  decision: string;
  comment: string | null;
  decidedAt: string;
};

/** Customer-safe design view: released drawings and published selections, each approvable once. */
export function CustomerDesign({
  t,
  locale,
  drawings,
  selections,
  decisions,
  action,
}: {
  t: Pick<Dictionary, "portal" | "status">;
  locale: Locale;
  drawings: CustomerDrawing[];
  selections: CustomerSelection[];
  decisions: CustomerDecision[];
  action: (fd: FormData) => Promise<void>;
}) {
  const c = t.portal.customer;
  const last = (id: string) => decisions.find((x) => x.entityId === id);

  const decide = (entityType: string, entityId: string) => (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <Hidden values={{ locale, entity_type: entityType, entity_id: entityId }} />
      <Input
        name="comment"
        placeholder={c.changeComment}
        className="h-7 min-w-40 flex-1 text-2xs"
      />
      <SubmitButton size="xs" variant="success" name="decision" value="approve">
        {c.approve}
      </SubmitButton>
      <SubmitButton size="xs" variant="secondary" name="decision" value="change">
        {c.requestChange}
      </SubmitButton>
    </form>
  );

  const outcome = (d: CustomerDecision) => (
    <p
      className={
        d.decision === "APPROVED"
          ? "flex items-center gap-1 text-2xs text-emerald-700"
          : "flex items-center gap-1 text-2xs text-amber-700"
      }
    >
      {d.decision === "APPROVED" ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <MessageSquareWarning className="size-3.5" />
      )}
      {d.decision === "APPROVED" ? c.approved : c.changeRequested} ·{" "}
      {formatDate(locale, d.decidedAt)}
      {d.comment ? ` · “${d.comment}”` : ""}
    </p>
  );

  return (
    <Panel title={c.design} description={c.designHint}>
      {drawings.length ? (
        <>
          <p className="border-b border-line bg-subtle px-4 py-1.5 text-2xs font-medium text-muted">
            {c.drawings}
          </p>
          <ul className="divide-y divide-line">
            {drawings.map((d) => {
              const done = last(d.revisionId);
              return (
                <li key={d.revisionId} className="space-y-2 px-4 py-3 text-[13px]">
                  <div className="flex items-center gap-3">
                    <FileText className="size-4 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{d.title}</p>
                      <p className="text-2xs text-muted">
                        {d.drawingNo} rev {d.revisionCode} ·{" "}
                        {label(t.status.discipline, d.discipline)} ·{" "}
                        {formatDate(locale, d.releasedAt)}
                      </p>
                    </div>
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[13px] font-medium text-brand hover:underline"
                      >
                        {c.openDrawing}
                      </a>
                    ) : null}
                  </div>
                  {done ? outcome(done) : decide("DRAWING_REVISION", d.revisionId)}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {selections.length ? (
        <>
          <p className="border-y border-line bg-subtle px-4 py-1.5 text-2xs font-medium text-muted">
            {c.selections}
          </p>
          <ul className="divide-y divide-line">
            {selections.map((s) => {
              const done = s.status !== "PUBLISHED" ? last(s.id) : undefined;
              return (
                <li key={s.id} className="space-y-2 px-4 py-3 text-[13px]">
                  <div className="flex items-center gap-3">
                    {s.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.imageUrl}
                        alt=""
                        className="size-12 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="size-12 shrink-0 rounded bg-subtle" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {s.area} · {s.material}
                      </p>
                      <p className="text-2xs text-muted">
                        {s.unitCode} · v{s.version}
                        {s.brand ? ` · ${s.brand}` : ""}
                      </p>
                    </div>
                    <Badge
                      tone={
                        s.status === "APPROVED"
                          ? "success"
                          : s.status === "PUBLISHED"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {label(t.status.selection, s.status)}
                    </Badge>
                  </div>
                  {s.status === "PUBLISHED"
                    ? decide("MATERIAL_SELECTION", s.id)
                    : done
                      ? outcome(done)
                      : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </Panel>
  );
}
