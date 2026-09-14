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
  // Reference's per-line edit modal - only ever actually applied server-side for a caller holding
  // pos.editLinePrice (see pos.service.ts's priceLine()), but mirrored here so the preview matches
  // what checkout will actually charge for that caller.
  unitPriceOverride?: number;
  taxOverridePercent?: number;
  // Laundry's own dimension-based pricing (carpets/curtains priced per m²) - when both are set,
  // the billed quantity is the entered quantity (pieces) scaled by the area, matching
  // pos.service.ts's priceLine() exactly.
  widthM?: number;
  heightM?: number;
}

export interface LineTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

/** Client-side preview only - the backend independently recalculates and is authoritative. */
export function calcLine(line: CartLine): LineTotals {
  const billedQuantity = line.widthM != null && line.heightM != null ? line.quantity * line.widthM * line.heightM : line.quantity;
  const unitPrice = line.unitPriceOverride ?? line.unitPrice;
  const taxPercent = line.taxOverridePercent ?? line.taxPercent;
  const gross = unitPrice * billedQuantity - line.discountAmount;
  if (line.taxType === "INCLUSIVE" && line.taxOverridePercent == null) {
    const subtotal = gross / (1 + taxPercent / 100);
    return { subtotal, taxAmount: gross - subtotal, total: gross };
  }
  const taxAmount = (gross * taxPercent) / 100;
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
