/**
 * Provisional rule for PV listedness (D-17, FR-F05-09). Deterministic, never the model.
 * A verdict is Provisional (current label) when historical applicability can't be established:
 *  - no case receipt date, or
 *  - the label's effective date is after the receipt date, or
 *  - any Recent Major Change month ends after the receipt date.
 */
import type { LabelMeta } from "./types.js";

export interface ProvisionalResult {
  provisional: boolean;
  reasons: string[];
}

function monthEnd(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yyyyMm}-${String(last).padStart(2, "0")}`;
}

export function provisionalFor(label: LabelMeta, receiptDate?: string): ProvisionalResult {
  if (!receiptDate) return { provisional: true, reasons: ["No case receipt date was given."] };
  const reasons: string[] = [];
  if (label.effectiveDate > receiptDate) {
    reasons.push(`The label is dated ${label.effectiveDate}, after the case receipt date ${receiptDate}.`);
  }
  for (const c of label.recentMajorChanges) {
    if (monthEnd(c.month) > receiptDate) {
      const where = c.section === "BW" ? "Boxed Warning" : `section ${c.section}`;
      reasons.push(`The ${where} changed in ${c.month}, after the case was received.`);
    }
  }
  return { provisional: reasons.length > 0, reasons };
}
