import ExcelJS from "exceljs";
import { Prisma, type ItemFulfillmentStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { computeShippingStatus } from "../sales/sale.service";
import { saleScopeWhere, parseAppScope,
  localDateTime,
  locationFiltersText,
  parseIdList,
  parseReportLocationQuery,
  productsNames,
  reportDateWindow,
  reportHeaderText,
  resolveReportLocations,
  styleHeaderRow,
  writeSheetHeader,
  xlsxFilename,
} from "./reportCommon";

const { Decimal } = Prisma;

/**
 * Reference's "Sales Report" (ReportController@getSalesReport + report/sales-report.blade.php): one
 * row per invoice, newest first - date, barcode (the invoice number), invoice no. (its counter after
 * the first "-"), items, before tax, discount, tax, extra services, total, the amount paid per
 * payment method, returned, total remaining, cashier and products - filtered by location group /
 * branch, date range and shipping status (multi).
 *
 * Shipping status here is this app's derived invoice status (the least-advanced item's fulfillment
 * stage - see computeShippingStatus), the counterpart of the reference's laundry shipping_status.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Only FINAL invoices (the reference skips only quotations not yet 'ready').
 *  - Before Tax is the gross line amount and Discount every discount on the invoice, so Before Tax
 *    - Discount + Tax + Extra Services = Total holds; the reference's Total is rebuilt from line
 *    amounts and silently drops invoice-level discounts, and its Discount omits them.
 *  - No branch picked = only permitted branches (the reference then lists every branch's
 *    invoices, ignoring the user's permitted locations).
 */

export const SHIPPING_STATUSES: ItemFulfillmentStatus[] = ["PENDING", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"];

/** Reference `invoice_counter`: the invoice number after its first "/" or "-". */
export function invoiceCounter(invoiceNumber: string | null) {
  if (!invoiceNumber) return null;
  const i = invoiceNumber.search(/[/-]/);
  return i > 0 ? invoiceNumber.slice(i + 1) : invoiceNumber;
}

export async function salesReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const shippingStatuses = parseIdList(query.shippingStatuses) as ItemFulfillmentStatus[];
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  const sales = await prisma.sale.findMany({
    where: { organizationId, status: "FINAL", businessLocationId: { in: locations.map((l) => l.id) }, saleDate: { gte: from, lte: to }, ...saleScopeWhere(scope) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      saleDate: true,
      taxAmount: true,
      discountAmount: true,
      totalAmount: true,
      createdByUser: { select: { fullNameEn: true, fullNameAr: true } },
      items: { select: { quantity: true, unitPrice: true, descriptionEn: true, descriptionAr: true, fulfillmentStatus: true } },
      payments: { where: { type: "SALE_PAYMENT" }, select: { amount: true, paymentMethod: { select: { id: true, nameEn: true, nameAr: true } } } },
      sellReturns: { select: { totalAmount: true } },
    },
  });

  const zero = () => new Decimal(0);
  const totals = { totalItems: zero(), beforeTax: zero(), discount: zero(), tax: zero(), extraServices: zero(), total: zero(), returned: zero(), remaining: zero() };
  const methodTotals = new Map<string, { nameEn: string; nameAr: string | null; amount: Prisma.Decimal }>();
  const rows = [];
  for (const s of sales) {
    const shippingStatus = s.items.length ? computeShippingStatus(s.items) : "PENDING";
    if (shippingStatuses.length > 0 && !shippingStatuses.includes(shippingStatus)) continue;
    const totalItems = s.items.reduce((a, i) => a.add(i.quantity), zero());
    const beforeTax = s.items.reduce((a, i) => a.add(i.quantity.mul(i.unitPrice)), zero()).toDecimalPlaces(2);
    const extraServices = s.totalAmount.sub(beforeTax).sub(s.taxAmount).add(s.discountAmount);
    const returned = s.sellReturns.reduce((a, r) => a.add(r.totalAmount), zero());
    const remaining = s.totalAmount.sub(returned);
    const amounts = { totalItems, beforeTax, discount: s.discountAmount, tax: s.taxAmount, extraServices, total: s.totalAmount, returned, remaining };
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = totals[k].add(amounts[k]);

    const byMethod = new Map<string, { nameEn: string; nameAr: string | null; amount: Prisma.Decimal }>();
    for (const p of s.payments) {
      const m = byMethod.get(p.paymentMethod.id) ?? { nameEn: p.paymentMethod.nameEn, nameAr: p.paymentMethod.nameAr, amount: zero() };
      m.amount = m.amount.add(p.amount);
      byMethod.set(p.paymentMethod.id, m);
      const t = methodTotals.get(p.paymentMethod.id) ?? { nameEn: p.paymentMethod.nameEn, nameAr: p.paymentMethod.nameAr, amount: zero() };
      t.amount = t.amount.add(p.amount);
      methodTotals.set(p.paymentMethod.id, t);
    }

    rows.push({
      id: s.id,
      date: localDateTime(s.saleDate),
      barcode: s.invoiceNumber,
      invoiceNo: invoiceCounter(s.invoiceNumber),
      shippingStatus,
      paymentMethods: [...byMethod.values()].map((m) => ({ nameEn: m.nameEn, nameAr: m.nameAr, amount: m.amount.toFixed(2) })),
      createdBy: s.createdByUser,
      ...productsNames(s.items),
      ...Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, v.toFixed(2)])),
    } as {
      id: string;
      date: string;
      barcode: string | null;
      invoiceNo: string | null;
      shippingStatus: ItemFulfillmentStatus;
      paymentMethods: { nameEn: string; nameAr: string | null; amount: string }[];
      createdBy: { fullNameEn: string; fullNameAr: string | null };
      productsEn: string;
      productsAr: string;
    } & Record<keyof typeof totals, string>);
  }

  return {
    startDate,
    endDate,
    filters: { ...filters, shippingStatuses: shippingStatuses.length ? shippingStatuses : null },
    rows,
    totals: {
      ...(Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toFixed(2)])) as Record<keyof typeof totals, string>),
      paymentMethods: [...methodTotals.values()].map((m) => ({ nameEn: m.nameEn, nameAr: m.nameAr, amount: m.amount.toFixed(2) })),
    },
  };
}

const SHIPPING_LABELS: Record<ItemFulfillmentStatus, { en: string; ar: string }> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار" },
  IN_PROGRESS: { en: "In Progress", ar: "قيد التنفيذ" },
  READY: { en: "Ready", ar: "جاهز" },
  DELIVERED: { en: "Delivered", ar: "تم التسليم" },
  CANCELLED: { en: "Cancelled", ar: "ملغى" },
};

export async function salesReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await salesReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير المبيعات" : "Sales Report", { views: [{ rightToLeft: isAr }] });
  const headers = isAr
    ? ["التاريخ", "الباركود", "رقم الفاتورة", "مجموع العناصر", "الاجمالى قبل الضريبة", "الخصم", "الضريبة", "خدمات اضافيه", "المجموع", "طرق الدفع", "تم ارجاعها", "المتبقى", "انشأ من قبل", "المنتجات"]
    : ["Date", "Barcode", "Invoice No.", "Total Items", "Total Before Tax", "Discount", "Tax", "Extra Services", "Total", "Payment Methods", "Returned", "Total remaining", "Created By", "Products"];
  const width = headers.length;
  const extra = report.filters.shippingStatuses
    ? [`${isAr ? "حالة الشحن" : "Shipping Status"}: ${report.filters.shippingStatuses.map((s) => SHIPPING_LABELS[s][isAr ? "ar" : "en"]).join(", ")}`]
    : [];
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(report.filters, isAr, extra)], width, `${report.startDate} ~ ${report.endDate}`);
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  const methods = (list: { nameEn: string; nameAr: string | null; amount: string }[]) =>
    list.map((m) => `${isAr ? m.nameAr || m.nameEn : m.nameEn}: ${Number(m.amount).toFixed(2)}`).join("\n");
  for (const row of report.rows) {
    sheet.getRow(r).values = [
      row.date,
      row.barcode ?? "",
      row.invoiceNo ?? "",
      ...[row.totalItems, row.beforeTax, row.discount, row.tax, row.extraServices, row.total].map(Number),
      methods(row.paymentMethods),
      Number(row.returned),
      Number(row.remaining),
      isAr ? row.createdBy.fullNameAr || row.createdBy.fullNameEn : row.createdBy.fullNameEn,
      isAr ? row.productsAr : row.productsEn,
    ];
    sheet.getRow(r).getCell(10).alignment = { wrapText: true, vertical: "top" };
    r++;
  }
  const t = report.totals;
  sheet.getRow(r).values = [
    isAr ? "المجموع" : "Total",
    "",
    "",
    ...[t.totalItems, t.beforeTax, t.discount, t.tax, t.extraServices, t.total].map(Number),
    methods(t.paymentMethods),
    Number(t.returned),
    Number(t.remaining),
  ];
  sheet.getRow(r).font = { bold: true };
  sheet.getRow(r).getCell(10).alignment = { wrapText: true, vertical: "top" };
  [18, 16, 12, 12, 16, 12, 12, 14, 14, 24, 12, 16, 20, 50].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  for (const c of [4, 5, 6, 7, 8, 9, 11, 12]) sheet.getColumn(c).numFmt = "#,##0.00";
  return { workbook, filename: xlsxFilename("Sales_Report") };
}
