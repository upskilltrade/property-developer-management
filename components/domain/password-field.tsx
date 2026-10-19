"use client";

import { useState } from "react";
import { Copy, Eye, EyeOff, Shuffle } from "lucide-react";
import { Input } from "@/components/ui/field";

// No look-alike characters (0/O, 1/l/I) so a password read out over the phone or LINE is unambiguous.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function randomPassword(length = 10) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Password input for an owner setting someone's first password: generate, show and copy. */
export function PasswordField({
  minLength,
  labels,
}: {
  minLength: number;
  labels: { generate: string; show: string; copy: string };
}) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Input
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          minLength={minLength}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="font-mono"
        />
        <button
          type="button"
          aria-label={labels.show}
          title={labels.show}
          onClick={() => setVisible(!visible)}
          className="grid size-9 shrink-0 place-items-center rounded-md border border-line text-muted hover:text-ink"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
        <button
          type="button"
          aria-label={labels.copy}
          title={labels.copy}
          disabled={!value}
          onClick={() => navigator.clipboard?.writeText(value)}
          className="grid size-9 shrink-0 place-items-center rounded-md border border-line text-muted hover:text-ink disabled:opacity-40"
        >
          <Copy className="size-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          setValue(randomPassword());
          setVisible(true);
        }}
        className="inline-flex items-center gap-1 text-2xs font-medium text-brand hover:underline"
      >
        <Shuffle className="size-3" />
        {labels.generate}
      </button>
    </div>
  );
}
