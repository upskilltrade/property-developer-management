import type { Tone } from "@/lib/status";

export const paymentKinds = ["BOOKING", "CONTRACT", "INSTALLMENT", "TRANSFER", "OTHER"] as const;
export const paymentMethods = ["TRANSFER", "CASH", "CHEQUE", "CARD", "OTHER"] as const;

/** Derived by the payment_schedule_status view; never typed in. */
export const paymentStatusTone: Record<string, Tone> = {
  SCHEDULED: "neutral",
  DUE: "warning",
  SUBMITTED: "info",
  PARTIAL: "accent",
  PAID: "success",
  OVERDUE: "danger",
  WAIVED: "neutral",
  CANCELLED: "neutral",
};

export const evidenceStatusTone: Record<string, Tone> = {
  SUBMITTED: "info",
  VERIFIED: "success",
  REJECTED: "danger",
};

export type ScheduleItem = {
  kind: (typeof paymentKinds)[number];
  label_th: string;
  label_en: string;
  amount: number;
  due_date: string;
};

const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Starting point for a schedule (the standard schedule is still an open business question, so
 * every row is editable): booking deposit, contract payment to reach `contractPct`, equal monthly
 * down-payment installments to reach `downPct`, and the balance on transfer.
 */
export function defaultSchedule({
  price,
  start,
  transfer,
  booking = 50_000,
  contractPct = 10,
  downPct = 15,
  installments = 5,
}: {
  price: number;
  start: string;
  transfer: string;
  booking?: number;
  contractPct?: number;
  downPct?: number;
  installments?: number;
}): ScheduleItem[] {
  if (!(price > 0)) return [];
  const items: ScheduleItem[] = [];
  const bookingAmount = Math.min(booking, price);
  items.push({
    kind: "BOOKING",
    label_th: "เงินจอง",
    label_en: "Booking deposit",
    amount: bookingAmount,
    due_date: start,
  });
  const contractAmount = round(Math.max(0, (price * contractPct) / 100 - bookingAmount));
  if (contractAmount > 0)
    items.push({
      kind: "CONTRACT",
      label_th: "ทำสัญญา",
      label_en: "Contract signing",
      amount: contractAmount,
      due_date: addMonths(start, 1),
    });
  // Never schedule more than the price, e.g. when the booking deposit already covers it.
  const remaining = round(price - items.reduce((a, x) => a + x.amount, 0));
  const down = Math.min(round((price * downPct) / 100), remaining);
  if (installments > 0 && down > 0) {
    const each = round(down / installments);
    for (let i = 1; i <= installments; i++)
      items.push({
        kind: "INSTALLMENT",
        label_th: `ผ่อนดาวน์งวดที่ ${i}`,
        label_en: `Down payment ${i}`,
        amount: i === installments ? round(down - each * (installments - 1)) : each,
        due_date: addMonths(start, 1 + i),
      });
  }
  const paid = items.reduce((a, x) => a + x.amount, 0);
  if (price - paid > 0)
    items.push({
      kind: "TRANSFER",
      label_th: "ชำระส่วนที่เหลือวันโอน",
      label_en: "Balance on transfer",
      amount: round(price - paid),
      due_date: transfer,
    });
  return items;
}
