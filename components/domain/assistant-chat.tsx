"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, RotateCcw, SendHorizonal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

type Turn = { role: "user" | "assistant"; content: string; error?: boolean };
type Labels = {
  placeholder: string;
  send: string;
  clear: string;
  working: string;
  disclaimer: string;
  examples: string[];
  tools: Record<string, string>;
  errors: Record<string, string>;
  truncated: string;
};

/**
 * Inline markdown for assistant answers: **bold**, [text](link) and plain text. Only links into
 * this app's own pages are rendered as links; anything else stays text.
 */
function inline(text: string, prefixes: string[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`${key}-${i++}`}>{m[1]}</strong>);
    else if (prefixes.some((p) => m![3].startsWith(p)))
      out.push(
        <Link key={`${key}-${i++}`} href={m[3]} className="font-medium text-brand hover:underline">
          {m[2]}
        </Link>,
      );
    else out.push(m[2]);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text, prefixes }: { text: string; prefixes: string[] }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`l${blocks.length}`}
        className={cn("space-y-0.5 pl-5", list.ordered ? "list-decimal" : "list-disc")}
      >
        {list.items.map((item, i) => (
          <li key={i}>{inline(item, prefixes, `l${blocks.length}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  text.split("\n").forEach((raw, n) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      return;
    }
    flush();
    if (!line.trim()) return;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      <p key={`p${n}`} className={heading ? "font-semibold text-ink" : undefined}>
        {inline(heading ? heading[1] : line, prefixes, `p${n}`)}
      </p>,
    );
  });
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

export function AssistantChat({
  locale,
  labels,
  configured,
  endpoint = `/${locale}/app/assistant/chat`,
  linkPrefixes = [`/${locale}/app/`],
  compact = false,
}: {
  locale: string;
  labels: Labels;
  configured: boolean;
  /** Route that answers in the NDJSON protocol below. */
  endpoint?: string;
  /** Only links starting with one of these render as links. */
  linkPrefixes?: string[];
  /** Fits a side sheet instead of a full page. */
  compact?: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, progress]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    // Failed answers are shown but not sent back as history.
    const history = [...turns.filter((t) => !t.error), { role: "user" as const, content: q }];
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    setProgress([]);
    const fail = (key: string) =>
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: labels.errors[key] ?? labels.errors.generic, error: true },
      ]);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-20).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (res.status === 503) return fail("not_configured");
      if (!res.ok || !res.body) return fail("generic");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answered = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            name?: string;
            text?: string;
            message?: string;
            truncated?: boolean;
          };
          if (event.type === "tool" && event.name)
            setProgress((p) => [...p, labels.tools[event.name!] ?? event.name!]);
          else if (event.type === "text") {
            answered = true;
            setTurns((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `${event.text ?? ""}${event.truncated ? `\n\n${labels.truncated}` : ""}`,
              },
            ]);
          } else if (event.type === "error") {
            answered = true;
            fail(event.message ?? "generic");
          }
        }
      }
      if (!answered) fail("generic");
    } catch {
      fail("generic");
    } finally {
      setBusy(false);
      setProgress([]);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-line bg-surface shadow-xs",
        compact ? "h-[calc(100dvh-7.5rem)]" : "min-h-[calc(100dvh-11rem)]",
      )}
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!turns.length ? (
          <div className={cn("mx-auto max-w-2xl text-center", compact ? "py-2" : "py-6")}>
            <Sparkles className="mx-auto mb-3 size-8 text-brand" />
            {!configured ? (
              <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                {labels.errors.not_configured}
              </p>
            ) : null}
            <div className={cn("grid gap-2", !compact && "sm:grid-cols-2")}>
              {labels.examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={!configured}
                  onClick={() => ask(ex)}
                  className="rounded-md border border-line px-3 py-2 text-left text-[13px] text-ink-2 hover:border-brand/40 hover:bg-subtle disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => (
            <div
              key={i}
              className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[min(48rem,92%)] rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed",
                  t.role === "user"
                    ? "bg-brand text-white"
                    : t.error
                      ? "border border-red-200 bg-red-50 text-red-800"
                      : "border border-line bg-subtle text-ink",
                )}
              >
                {t.role === "assistant" && !t.error ? (
                  <Markdown text={t.content} prefixes={linkPrefixes} />
                ) : (
                  <p className="whitespace-pre-wrap">{t.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        {busy ? (
          <div className="flex items-start gap-2 text-2xs text-muted">
            <Loader2 className="mt-0.5 size-3.5 animate-spin" />
            <div>
              <p>{labels.working}</p>
              {progress.map((p, i) => (
                <p key={i} className="text-faint">
                  · {p}
                </p>
              ))}
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={2}
            maxLength={4000}
            disabled={!configured}
            placeholder={labels.placeholder}
            className="min-h-10 flex-1 resize-none rounded-md border border-line-strong bg-surface px-2.5 py-2 text-[13px] focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none disabled:bg-subtle"
          />
          <Button type="submit" variant="primary" disabled={busy || !input.trim() || !configured}>
            <SendHorizonal />
            {labels.send}
          </Button>
          {turns.length ? (
            <Button
              type="button"
              variant="ghost"
              aria-label={labels.clear}
              title={labels.clear}
              disabled={busy}
              onClick={() => setTurns([])}
            >
              <RotateCcw />
            </Button>
          ) : null}
        </div>
        <p className="mt-1.5 text-[10px] text-faint">{labels.disclaimer}</p>
      </form>
    </div>
  );
}
