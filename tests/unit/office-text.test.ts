import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { officeText, xmlText } from "@/lib/office-text";

/** A minimal zip archive (deflated entries) for the given files. */
function zip(files: Record<string, string>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text, "utf8"));
    const n = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

describe("office text", () => {
  it("reads a Word document's paragraphs", () => {
    const doc = zip({
      "[Content_Types].xml": "<Types/>",
      "word/document.xml":
        "<w:document><w:body><w:p><w:r><w:t>Monteva Hua Hin</w:t></w:r></w:p><w:p><w:r><w:t>Pool villa &amp; garden</w:t></w:r></w:p></w:body></w:document>",
    });
    expect(officeText(doc, "spec.docx")).toBe("Monteva Hua Hin\nPool villa & garden");
  });

  it("reads PowerPoint slides in order", () => {
    const deck = zip({
      "ppt/slides/slide10.xml": "<p:sld><a:p><a:t>Ten</a:t></a:p></p:sld>",
      "ppt/slides/slide2.xml": "<p:sld><a:p><a:t>Two</a:t></a:p></p:sld>",
    });
    expect(officeText(deck, "deck.pptx")).toBe("Two\n\nTen");
  });

  it("ignores other files and broken archives", () => {
    expect(officeText(Buffer.from("not a zip"), "x.docx")).toBeNull();
    expect(officeText(zip({ "a.txt": "x" }), "x.pdf")).toBeNull();
    expect(xmlText("<a:p><a:t>5 &lt; 6 &#3652;</a:t></a:p>")).toBe("5 < 6 ไ");
  });
});
