export interface CartLine {
  key: string;
  type: "PRODUCT" | "SERVICE";
  id: string;
  nameEn: string;
  nameAr: string;
  unitPrice: number;
  taxPercent: number;
  taxType: "INCLUSIVE" | "EXCLUSIVE";
  quantity: number;
  discountAmount: number;
  stockOnHand?: number;
  manageStock?: boolean;
  unit: string;
}

export interface LineTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

/** Client-side preview only - the backend independently recalculates and is authoritative. */
export function calcLine(line: CartLine): LineTotals {
  const gross = line.unitPrice * line.quantity - line.discountAmount;
  if (line.taxType === "INCLUSIVE") {
    const subtotal = gross / (1 + line.taxPercent / 100);
    return { subtotal, taxAmount: gross - subtotal, total: gross };
  }
  const taxAmount = (gross * line.taxPercent) / 100;
  return { subtotal: gross, taxAmount, total: gross + taxAmount };
}

export function calcCartTotals(lines: CartLine[]) {
  return lines.reduce(
    (acc, line) => {
      const t = calcLine(line);
      return {
        subtotal: acc.subtotal + t.subtotal,
        taxAmount: acc.taxAmount + t.taxAmount,
        total: acc.total + t.total,
        discountAmount: acc.discountAmount + line.discountAmount,
      };
    },
    { subtotal: 0, taxAmount: 0, total: 0, discountAmount: 0 },
  );
}
