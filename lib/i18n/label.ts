/** Looks up a translated label for a machine status code, falling back to the code itself. */
export function label(map: Record<string, string>, code: string | null | undefined) {
  if (!code) return "—";
  return map[code] ?? code;
}
