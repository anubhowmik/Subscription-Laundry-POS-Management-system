import type { InvoiceLayoutSettings } from "../../types/api";

/**
 * Every hardcoded label the invoice templates render, with its default EN/AR text. A branch's
 * InvoiceLayoutSettings.labelOverrides is a sparse map over this same key set - a missing key
 * falls back to the default here, so an unconfigured branch renders identically to before this
 * override system existed.
 */
export const DEFAULT_LABELS = {
  vatNumberLabel: { en: "VAT Number", ar: "الرقم الضريبي" },
  crNumberLabel: { en: "CR Number", ar: "رقم السجل التجاري" },
  invoiceNoLabel: { en: "Invoice No", ar: "رقم الفاتورة" },
  dateLabel: { en: "Date", ar: "التاريخ" },
  invoiceUuidLabel: { en: "Invoice UUID", ar: "معرف الفاتورة" },
  icvLabel: { en: "ICV", ar: "عداد الفواتير" },
  customerLabel: { en: "Customer", ar: "العميل" },
  registerLabel: { en: "Register", ar: "السجل النقدي" },
  itemLabel: { en: "Item", ar: "الصنف" },
  skuLabel: { en: "SKU", ar: "الرمز" },
  qtyLabel: { en: "Qty", ar: "الكمية" },
  unitPriceLabel: { en: "Unit Price", ar: "سعر الوحدة" },
  vatColLabel: { en: "VAT", ar: "الضريبة" },
  totalColLabel: { en: "Total", ar: "الإجمالي" },
  subtotalLabel: { en: "Subtotal", ar: "المجموع الفرعي" },
  discountLabel: { en: "Discount", ar: "الخصم" },
  taxLabel: { en: "VAT", ar: "ضريبة القيمة المضافة" },
  totalLabel: { en: "Total", ar: "الإجمالي" },
  paidLabel: { en: "Paid", ar: "المدفوع" },
  dueLabel: { en: "Due", ar: "المستحق" },
  estimatedReadyLabel: { en: "Estimated Ready", ar: "موعد الجاهزية المتوقع" },
} as const;

export type LabelKey = keyof typeof DEFAULT_LABELS;

export function resolveLabel(key: LabelKey, isAr: boolean, layout: InvoiceLayoutSettings | null): string {
  const override = layout?.labelOverrides?.[key];
  if (override) return isAr ? override.ar : override.en;
  return isAr ? DEFAULT_LABELS[key].ar : DEFAULT_LABELS[key].en;
}

/** A toggle field is "on" whenever there's no persisted row at all (branch never customized
 * anything) or the row exists but hasn't explicitly turned that field off. */
export function isShown(key: keyof Omit<InvoiceLayoutSettings, "id" | "businessLocationId" | "name" | "isDefault" | "templateKey" | "logoUrl" | "accentColor" | "labelOverrides">, layout: InvoiceLayoutSettings | null): boolean {
  if (!layout) return true;
  return layout[key];
}
