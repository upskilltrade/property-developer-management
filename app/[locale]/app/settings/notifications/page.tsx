import type { Metadata } from "next";
import { headers } from "next/headers";
import { CalendarDays, CheckCircle2, CircleDashed, Play, RefreshCw } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDateTime, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Field, Hidden, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import {
  rotateCalendar,
  runAutomationNow,
  savePreferences,
} from "@/app/[locale]/app/notifications/actions";

export const metadata: Metadata = { title: "Notification settings" };

type Status = { email: boolean; line: boolean; base_url: boolean; scheduler: boolean };

function Ready({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-2xs text-emerald-700">
      <CheckCircle2 className="size-3.5" />
      {yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-2xs text-muted">
      <CircleDashed className="size-3.5" />
      {no}
    </span>
  );
}

function Toggle({
  name,
  checked,
  title,
  hint,
  disabled,
  extra,
}: {
  name: string;
  checked: boolean;
  title: string;
  hint: string;
  disabled?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 px-4 py-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        disabled={disabled}
        className="mt-0.5 size-4 accent-[var(--color-brand)]"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block text-2xs text-muted">{hint}</span>
        {extra}
      </span>
    </label>
  );
}

export default async function NotificationSettings({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ran?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { ran } = await searchParams;
  const { supabase, user, ownerOrganizationId } = await getSession(locale);
  const s = t.notifications.settings;
  const isOwner = Boolean(ownerOrganizationId);

  const [{ data: pref }, { data: feed }, { data: statusRaw }, runs, outbox] = await Promise.all([
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("calendar_feeds").select("token").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("integration_status"),
    isOwner
      ? supabase
          .from("automation_runs")
          .select("id,job,started_at,finished_at,notifications")
          .order("started_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    isOwner
      ? supabase
          .from("notification_outbox")
          .select("status")
          .order("created_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] }),
  ]);
  const status = (statusRaw ?? {
    email: false,
    line: false,
    base_url: false,
    scheduler: false,
  }) as Status;

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const calendarUrl = feed?.token ? `${origin}/${locale}/calendar/${feed.token}.ics` : null;
  const outboxCounts = ((outbox.data ?? []) as { status: string }[]).reduce<Record<string, number>>(
    (a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }),
    {},
  );

  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      {ran !== undefined ? (
        <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          {s.ran.replace("{n}", formatNumber(locale, Number(ran) || 0))}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={s.channels}>
          <form action={savePreferences} className="divide-y divide-line">
            <Hidden values={{ locale }} />
            <Toggle name="in_app" checked title={s.inApp} hint={s.inAppHint} disabled />
            <Toggle
              name="email_enabled"
              checked={pref?.email_enabled ?? false}
              title={s.email}
              hint={`${s.emailHint} (${user.email ?? "—"})`}
              extra={<Ready ok={status.email} yes={s.configured} no={s.notConfigured} />}
            />
            <Toggle
              name="line_enabled"
              checked={pref?.line_enabled ?? false}
              title={s.line}
              hint={s.lineHint}
              extra={
                <>
                  <Ready ok={status.line} yes={s.configured} no={s.notConfigured} />
                  <Field label={s.lineUserId} hint={s.lineUserIdHint} className="mt-2">
                    <Input
                      name="line_user_id"
                      defaultValue={pref?.line_user_id ?? ""}
                      placeholder="U1234567890abcdef…"
                      className="h-8 font-mono"
                    />
                  </Field>
                </>
              }
            />
            {isOwner ? (
              <Toggle
                name="digest_enabled"
                checked={pref?.digest_enabled ?? true}
                title={s.digest}
                hint={s.digestHint}
              />
            ) : (
              <input type="hidden" name="digest_enabled" value="on" />
            )}
            <div className="flex justify-end px-4 py-3">
              <SubmitButton>{s.save}</SubmitButton>
            </div>
          </form>
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4 text-muted" />
              {s.calendar}
            </span>
          }
          description={s.calendarHint}
        >
          <div className="space-y-3 px-4 py-3">
            {calendarUrl ? (
              <>
                <Input readOnly value={calendarUrl} className="h-8 font-mono text-2xs" />
                <p className="text-2xs text-amber-700">{s.calendarPrivate}</p>
              </>
            ) : null}
            <form action={rotateCalendar} className="flex items-center gap-3">
              <Hidden values={{ locale }} />
              <SubmitButton variant={calendarUrl ? "secondary" : "primary"} size="sm">
                <RefreshCw />
                {calendarUrl ? s.calendarRotate : s.calendarCreate}
              </SubmitButton>
              {calendarUrl ? (
                <span className="text-2xs text-muted">{s.calendarRotateHint}</span>
              ) : null}
            </form>
          </div>
        </Panel>

        {isOwner ? (
          <>
            <Panel
              title={s.automation}
              description={s.automationHint}
              actions={
                <form action={runAutomationNow}>
                  <Hidden values={{ locale }} />
                  <SubmitButton size="xs" variant="secondary">
                    <Play />
                    {s.runNow}
                  </SubmitButton>
                </form>
              }
            >
              <div className="flex flex-wrap gap-4 border-b border-line px-4 py-2.5">
                <span className="text-2xs text-muted">{s.scheduler}:</span>
                <Ready ok={status.scheduler} yes={s.configured} no="—" />
              </div>
              <Table>
                <THead>
                  <tr>
                    <TH>{s.started}</TH>
                    <TH align="right">{s.created}</TH>
                  </tr>
                </THead>
                <tbody>
                  {(
                    (runs.data ?? []) as { id: string; started_at: string; notifications: number }[]
                  ).map((r) => (
                    <TR key={r.id}>
                      <TD className="text-2xs">{formatDateTime(locale, r.started_at)}</TD>
                      <TD align="right" className="num">
                        {r.notifications}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Panel>

            <Panel title={s.delivery} description={s.deliveryHint}>
              <div className="flex flex-wrap gap-2 px-4 py-3">
                {(["PENDING", "SENT", "FAILED", "SKIPPED"] as const).map((k) => (
                  <Badge
                    key={k}
                    tone={
                      k === "SENT"
                        ? "success"
                        : k === "FAILED"
                          ? "danger"
                          : k === "PENDING"
                            ? "warning"
                            : "neutral"
                    }
                  >
                    {label(t.notifications.outbox, k)} · {outboxCounts[k] ?? 0}
                  </Badge>
                ))}
              </div>
              <div className="border-t border-line px-4 py-3 text-2xs">
                <p className="mb-1 font-medium text-ink-2">{s.setup}</p>
                <p className="text-muted">{s.setupSteps}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <span>
                    {s.email}: <Ready ok={status.email} yes={s.configured} no="—" />
                  </span>
                  <span>
                    {s.line}: <Ready ok={status.line} yes={s.configured} no="—" />
                  </span>
                  <span>
                    app_base_url: <Ready ok={status.base_url} yes={s.configured} no="—" />
                  </span>
                </div>
              </div>
            </Panel>
          </>
        ) : null}
      </div>
    </>
  );
}
