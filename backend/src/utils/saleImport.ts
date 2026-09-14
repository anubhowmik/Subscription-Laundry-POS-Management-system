/**
 * Row-parsing for the "Import Sales" feature (see importSales.service.ts) - converted from the
 * reference's own `ImportSalesController::import()` fixed-column spec (its reachable, actually
 * linked-to code path - see import_sales/index.blade.php's upload form; the controller's other
 * `preview()`/`__importSales()` dynamic-column-mapping methods exist in that file but nothing in
 * the UI ever links to them, so they're dead code there, not a second real feature to match).
 *
 * Deliberately scoped to FINAL sales only (the reference's own `type` column also accepts draft/
 * quotation/sales_order, but bulk-loading historical UNFINISHED documents is a vanishingly rare
 * real want next to "bring in our old completed invoices for reporting continuity" - the same kind
 * of scope trim already made elsewhere this rebuild, e.g. sellReturn's reason enum). Every
 * imported row also skips the ZATCA icv/hash chain entirely (see importSales.service.ts) rather
 * than trying to splice historical data into a live cryptographic sequence.
 */

const DATE_ERR = "must be a valid date";

export const SALE_IMPORT_HEADER_MAP: Record<string, string> = {
  "business location": "businessLocationName",
  "invoice no": "invoiceNumber",
  date: "dateRaw",
  "customer phone": "customerPhone",
  "item code": "itemCode",
  quantity: "quantityRaw",
  "unit price": "unitPriceRaw",
  "discount %": "discountRaw",
  "tax %": "taxRaw",
  note: "note",
  "created by": "createdByUsername",
};

export interface ParsedSaleLineRow {
  businessLocationName: string;
  invoiceNumber: string;
  date?: Date;
  customerPhone: string;
  itemCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  /** undefined = fall back to the matched product/service's own catalog tax rate. */
  taxPercent?: number;
  note?: string;
  createdByUsername?: string;
}

function parseRequiredNumber(raw: string | undefined, rowNumber: number, label: string): number | string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return `Row ${rowNumber}: "${label}" is required`;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return `Row ${rowNumber}: "${label}" must be a number (got "${raw}")`;
  return n;
}

function parseOptionalNumber(raw: string | undefined, rowNumber: number, label: string): number | string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return `Row ${rowNumber}: "${label}" must be a number (got "${raw}")`;
  return n;
}

/** Returns either the parsed row or a human-readable error string - never both. */
export function parseSaleImportRow(raw: Record<string, string>, rowNumber: number): { data: ParsedSaleLineRow } | { error: string } {
  const businessLocationName = raw.businessLocationName?.trim();
  if (!businessLocationName) return { error: `Row ${rowNumber}: "Business Location" is required` };

  const invoiceNumber = raw.invoiceNumber?.trim();
  if (!invoiceNumber) return { error: `Row ${rowNumber}: "Invoice No" is required` };

  let date: Date | undefined;
  const dateRaw = raw.dateRaw?.trim();
  if (dateRaw) {
    const parsed = new Date(dateRaw);
    if (Number.isNaN(parsed.getTime())) return { error: `Row ${rowNumber}: "Date" ${DATE_ERR} (got "${dateRaw}")` };
    date = parsed;
  }

  const customerPhone = raw.customerPhone?.trim();
  if (!customerPhone) return { error: `Row ${rowNumber}: "Customer Phone" is required` };

  const itemCode = raw.itemCode?.trim();
  if (!itemCode) return { error: `Row ${rowNumber}: "Item Code" is required` };

  const quantity = parseRequiredNumber(raw.quantityRaw, rowNumber, "Quantity");
  if (typeof quantity === "string") return { error: quantity };
  if (quantity <= 0) return { error: `Row ${rowNumber}: "Quantity" must be greater than zero` };

  const unitPrice = parseRequiredNumber(raw.unitPriceRaw, rowNumber, "Unit Price");
  if (typeof unitPrice === "string") return { error: unitPrice };

  const discountPercent = parseOptionalNumber(raw.discountRaw, rowNumber, "Discount %");
  if (typeof discountPercent === "string") return { error: discountPercent };
  if (discountPercent < 0 || discountPercent > 100) return { error: `Row ${rowNumber}: "Discount %" must be between 0 and 100` };

  let taxPercent: number | undefined;
  const taxRaw = raw.taxRaw?.trim();
  if (taxRaw) {
    const parsedTax = Number(taxRaw);
    if (Number.isNaN(parsedTax)) return { error: `Row ${rowNumber}: "Tax %" must be a number (got "${taxRaw}")` };
    taxPercent = parsedTax;
  }

  return {
    data: {
      businessLocationName,
      invoiceNumber,
      date,
      customerPhone,
      itemCode,
      quantity,
      unitPrice,
      discountPercent,
      taxPercent,
      note: raw.note?.trim() || undefined,
      createdByUsername: raw.createdByUsername?.trim() || undefined,
    },
  };
}
