import "server-only";
import { inflateRawSync } from "node:zlib";

/**
 * Plain text from a Word (.docx), PowerPoint (.pptx) or Excel (.xlsx) file, so the AI can read it.
 * These are zip archives of XML; this reads the zip's central directory, inflates the XML parts
 * that hold the text and strips the tags. Returns null when the file isn't such an archive.
 */
export function officeText(buf: Buffer, name: string, maxChars = 60_000): string | null {
  const ext = name.split(".").pop()?.toLowerCase();
  const wanted =
    ext === "docx"
      ? (p: string) => /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(p)
      : ext === "pptx"
        ? (p: string) => /^ppt\/slides\/slide\d+\.xml$/.test(p)
        : ext === "xlsx"
          ? (p: string) => p === "xl/sharedStrings.xml"
          : null;
  if (!wanted) return null;
  const parts = readZip(buf).filter((e) => wanted(e.name));
  if (!parts.length) return null;
  // Slides in their number order, not zip order.
  parts.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const text = parts
    .map((e) => xmlText(e.data.toString("utf8")))
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, maxChars) : null;
}

/** Paragraph, line and cell breaks become new lines; every other tag is dropped. */
export function xmlText(xml: string) {
  return xml
    .replace(/<\/(w:p|a:p|si)>|<(w:br|w:tab|a:br)[^>]*\/>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Entries of a zip archive (stored or deflated), read from its central directory. */
function readZip(buf: Buffer) {
  const out: { name: string; data: Buffer }[] = [];
  // End of central directory: signature 0x06054b50, searched from the end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    try {
      if (method === 0) out.push({ name, data: raw });
      else if (method === 8) out.push({ name, data: inflateRawSync(raw) });
    } catch {
      // A damaged entry is skipped; the rest of the file can still be read.
    }
  }
  return out;
}
