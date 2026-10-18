import type { Locale } from "@/lib/i18n/config";
import { formatMoney, formatNumber, toNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";

export type VoItemRow = {
  id: string;
  seq: number;
  kind: string;
  description: string;
  quantity: number | string;
  unit: string | null;
  unit_price: number | string;
  amount: number | string;
};

/** Additions / omissions of one VO version, with totals. */
export function VoItemsTable({
  locale,
  items,
  labels,
}: {
  locale: Locale;
  items: VoItemRow[];
  labels: {
    kind: { ADD: string; OMIT: string };
    itemDesc: string;
    qty: string;
    unitPrice: string;
    amount: string;
    totalAdd: string;
    totalOmit: string;
    net: string;
  };
}) {
  const sum = (k: string) =>
    items.filter((i) => i.kind === k).reduce((a, i) => a + toNumber(i.amount), 0);
  const add = sum("ADD");
  const omit = sum("OMIT");
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full text-[12px]">
        <thead className="bg-subtle text-2xs text-muted">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium" />
            <th className="px-2 py-1.5 text-left font-medium">{labels.itemDesc}</th>
            <th className="px-2 py-1.5 text-right font-medium">{labels.qty}</th>
            <th className="px-2 py-1.5 text-right font-medium">{labels.unitPrice}</th>
            <th className="px-2 py-1.5 text-right font-medium">{labels.amount}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...items]
            .sort((a, b) => a.seq - b.seq)
            .map((i) => (
              <tr key={i.id} className={i.kind === "OMIT" ? "bg-red-50/40" : undefined}>
                <td className="px-2 py-1.5">
                  <Badge tone={i.kind === "ADD" ? "success" : "danger"}>
                    {labels.kind[i.kind as "ADD" | "OMIT"] ?? i.kind}
                  </Badge>
                </td>
                <td className="px-2 py-1.5">{i.description}</td>
                <td className="px-2 py-1.5 text-right num">
                  {formatNumber(locale, i.quantity, 2)} {i.unit ?? ""}
                </td>
                <td className="px-2 py-1.5 text-right num">{formatMoney(locale, i.unit_price)}</td>
                <td
                  className={cn(
                    "px-2 py-1.5 text-right font-medium num",
                    i.kind === "ADD" ? "text-emerald-700" : "text-red-700",
                  )}
                >
                  {i.kind === "OMIT" ? "−" : "+"}
                  {formatMoney(locale, i.amount)}
                </td>
              </tr>
            ))}
        </tbody>
        <tfoot className="border-t border-line bg-subtle text-2xs">
          <tr>
            <td colSpan={5} className="px-2 py-1.5 text-right">
              <span className="text-muted">{labels.totalAdd}</span>{" "}
              <span className="font-semibold text-emerald-700 num">
                +{formatMoney(locale, add)}
              </span>
              {" · "}
              <span className="text-muted">{labels.totalOmit}</span>{" "}
              <span className="font-semibold text-red-700 num">−{formatMoney(locale, omit)}</span>
              {" · "}
              <span className="text-muted">{labels.net}</span>{" "}
              <span className="font-semibold num">{formatMoney(locale, add - omit)}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
