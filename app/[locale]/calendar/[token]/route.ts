import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CalendarEvent = {
  uid: string;
  starts_at: string;
  all_day: boolean;
  title: string;
  description: string | null;
  link: string | null;
};

const escape = (v: string) =>
  v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545 lines are folded at 75 octets; folding by characters keeps Thai text intact.
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 60) {
    out.push(rest.slice(0, 60));
    rest = " " + rest.slice(60);
  }
  out.push(rest);
  return out.join("\r\n");
};

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const day = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
const nextDay = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return day(d.toISOString());
};

/**
 * Private iCal feed. The token is the only credential (calendar apps can't sign in); the database
 * resolves it to a user and returns only what that user may see.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ locale: string; token: string }> },
) {
  const { locale, token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{48}$/.test(token)) return new NextResponse("Not found", { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.rpc("calendar_events", { feed_token: token });
  if (error) return new NextResponse("Unavailable", { status: 503 });

  const origin = req.nextUrl.origin;
  const now = stamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DevPropertyPro//Calendar//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:DevPropertyPro",
    "X-WR-TIMEZONE:Asia/Bangkok",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const e of (data ?? []) as CalendarEvent[]) {
    const start = new Date(e.starts_at);
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@devpropertypro`, `DTSTAMP:${now}`);
    if (e.all_day) {
      lines.push(
        `DTSTART;VALUE=DATE:${day(e.starts_at)}`,
        `DTEND;VALUE=DATE:${nextDay(e.starts_at)}`,
      );
    } else {
      lines.push(
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(new Date(start.getTime() + 3_600_000))}`,
      );
    }
    lines.push(fold(`SUMMARY:${escape(e.title)}`));
    if (e.description) lines.push(fold(`DESCRIPTION:${escape(e.description)}`));
    if (e.link?.startsWith("/app/")) lines.push(fold(`URL:${origin}/${locale}${e.link}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="devpropertypro.ics"',
      "cache-control": "private, max-age=900",
    },
  });
}
