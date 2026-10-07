import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  locationFiltersText,
  parseReportLocationQuery,
  reportDateWindow,
  reportHeaderText,
  resolveReportLocations,
  styleHeaderRow,
  writeSheetHeader,
  xlsxFilename,
} from "./reportCommon";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

/**
 * Reference's "Detailed Sales Report" (ReportController@getDetailedSalesReport + Category::
 * report_data + report/detailed_sales_report.blade.php): for each branch, one row per category
 * with items sold, before tax, promotion / coupon discounts, unwashable quantity, tax, extra
 * services, total, returned, total remaining (total - returned), due and customers, plus a
 * per-branch total row.
 *
 * In the reference every discount and modifier lives on the sell line. Here coupon / manual /
 * points discounts, delivery and additional charges and the paid amount belong to the invoice, so
 * each invoice's figures are spread over its lines by line value - that keeps every category's
 * numbers summing exactly to the real invoices (and to the Sales Report). "Promotion Discounts" is
 * the line-level discount, "Coupon Discounts" the invoice-level ones. Unwashable is the quantity
 * returned as NOT_WASHABLE (this app records unwashable items as that return reason).
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Only FINAL invoices (the reference keeps quotations once 'ready' and every non-quotation).
 *  - Paid is allocated per line; the reference sums the whole invoice's payments once per joined
 *    sell line and per payment, so Due goes wrong on any multi-line invoice.
 *  - Items without a category are shown under "Uncategorized" instead of silently dropped.
 *  - No branch picked = every permitted branch (the reference silently shows only the first 5).
 */

const zero = () => new Decimal(0);
const KEYS = ["totalItems", "beforeTax", "promotionDiscount", "couponDiscount", "unwashable", "tax", "extraServices", "total", "returned", "remaining", "due"] as const;
type Key = (typeof KEYS)[number];
type Acc = Record<Key, Decimal> & { customers: Set<string> };
const newAcc = (): Acc => ({ ...(Object.fromEntries(KEYS.map((k) => [k, zero()])) as Record<Key, Decimal>), customers: new Set() });
const fmt = (a: Acc, customers: number) => ({ ...(Object.fromEntries(KEYS.map((k) => [k, a[k].toFixed(2)])) as Record<Key, string>), customers });

export async function detailedSalesReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  const [sales, productCategories, serviceCategories] = await Promise.all([
    prisma.sale.findMany({
      where: { organizationId, status: "FINAL", businessLocationId: { in: locations.map((l) => l.id) }, saleDate: { gte: from, lte: to } },
      select: {
        businessLocationId: true,
        customerId: true,
        discountAmount: true,
        taxAmount: true,
        totalAmount: true,
        paidAmount: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            discountAmount: true,
            subtotal: true,
            product: { select: { categoryId: true } },
            service: { select: { categoryId: true } },
            sellReturnItems: { select: { quantity: true, total: true, reason: true } },
          },
        },
      },
    }),
    prisma.category.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true, code: true, parentId: true } }),
    prisma.serviceCategory.findMany({ where: { organizationId }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
  ]);

  // Reference: top-level product categories, ordered by short code, shown as "Name-Code".
  const productTop = new Map<string, string>(); // any product category id -> its top-level id
  const byId = new Map(productCategories.map((c) => [c.id, c]));
  for (const c of productCategories) {
    let top = c;
    while (top.parentId && byId.get(top.parentId)) top = byId.get(top.parentId)!;
    productTop.set(c.id, top.id);
  }
  const categoryOrder: { key: string; nameEn: string; nameAr: string | null }[] = [
    ...productCategories
      .filter((c) => !c.parentId)
      .sort((a, b) => (Number(a.code) || Infinity) - (Number(b.code) || Infinity) || a.nameEn.localeCompare(b.nameEn))
      .map((c) => ({ key: `pc:${c.id}`, nameEn: c.code ? `${c.nameEn}-${c.code}` : c.nameEn, nameAr: c.code ? `${c.nameAr}-${c.code}` : c.nameAr })),
    ...serviceCategories.map((c) => ({ key: `sc:${c.id}`, nameEn: c.nameEn, nameAr: c.nameAr })),
    { key: "none", nameEn: "Uncategorized", nameAr: "بدون فئة" },
  ];

  const cells = new Map<string, Acc>(); // `${locationId}|${categoryKey}`
  for (const sale of sales) {
    const lineSum = sale.items.reduce((a, i) => a.add(i.subtotal), zero());
    const lineDiscounts = sale.items.reduce((a, i) => a.add(i.discountAmount), zero());
    const gross = sale.items.reduce((a, i) => a.add(i.quantity.mul(i.unitPrice)), zero());
    const invoiceDiscount = sale.discountAmount.sub(lineDiscounts);
    const extra = sale.totalAmount.sub(gross).sub(sale.taxAmount).add(sale.discountAmount);
    const paid = Prisma.Decimal.min(sale.paidAmount, sale.totalAmount);
    sale.items.forEach((line) => {
      const share = lineSum.gt(0) ? line.subtotal.div(lineSum) : new Decimal(1).div(sale.items.length);
      const categoryId = line.product?.categoryId ?? line.service?.categoryId ?? null;
      const categoryKey = line.product && categoryId ? `pc:${productTop.get(categoryId) ?? categoryId}` : line.service && categoryId ? `sc:${categoryId}` : "none";
      const key = `${sale.businessLocationId}|${categoryKey}`;
      const acc = cells.get(key) ?? newAcc();
      const couponDiscount = invoiceDiscount.mul(share);
      const tax = sale.taxAmount.mul(share);
      const extraServices = extra.mul(share);
      const total = sale.totalAmount.mul(share);
      const returned = line.sellReturnItems.reduce((a, r) => a.add(r.total), zero());
      acc.totalItems = acc.totalItems.add(line.quantity);
      acc.beforeTax = acc.beforeTax.add(line.subtotal.sub(couponDiscount));
      acc.promotionDiscount = acc.promotionDiscount.add(line.discountAmount);
      acc.couponDiscount = acc.couponDiscount.add(couponDiscount);
      acc.unwashable = acc.unwashable.add(line.sellReturnItems.filter((r) => r.reason === "NOT_WASHABLE").reduce((a, r) => a.add(r.quantity), zero()));
      acc.tax = acc.tax.add(tax);
      acc.extraServices = acc.extraServices.add(extraServices);
      acc.total = acc.total.add(total);
      acc.returned = acc.returned.add(returned);
      acc.remaining = acc.remaining.add(total.sub(returned));
      acc.due = acc.due.add(total.sub(paid.mul(share)));
      acc.customers.add(sale.customerId);
      cells.set(key, acc);
    });
  }

  const round = (a: Acc) => {
    for (const k of KEYS) a[k] = a[k].toDecimalPlaces(2);
    return a;
  };
  const grand = newAcc();
  let grandCustomers = 0;
  const branches = [];
  for (const location of locations) {
    const rows = [];
    const sub = newAcc();
    let subCustomers = 0;
    for (const cat of categoryOrder) {
      const acc = cells.get(`${location.id}|${cat.key}`);
      // Reference: a category row only appears when it sold something.
      if (!acc || acc.totalItems.eq(0)) continue;
      round(acc);
      for (const k of KEYS) sub[k] = sub[k].add(acc[k]);
      subCustomers += acc.customers.size;
      rows.push({ categoryKey: cat.key, nameEn: cat.nameEn, nameAr: cat.nameAr, ...fmt(acc, acc.customers.size) });
    }
    if (rows.length === 0) continue;
    for (const k of KEYS) grand[k] = grand[k].add(sub[k]);
    grandCustomers += subCustomers;
    branches.push({ locationId: location.id, branchName: location.branchName, branchNameAr: location.branchNameAr, branchCode: location.branchCode, rows, totals: fmt(sub, subCustomers) });
  }

  return { startDate, endDate, filters, branches, totals: fmt(grand, grandCustomers) };
}

export function detailedSalesHeaders(isAr: boolean) {
  return isAr
    ? ["الفئة", "مجموع العناصر", "الاجمالى قبل الضريبة", "خصومات الترويج", "خصومات القسيمة", "غير قابل للغسيل", "الضريبة", "خدمات اضافيه", "المجموع", "تم ارجاعها", "المتبقى (المجموع - المرتجع)", "مستحق الدفع", "إجمالي العملاء"]
    : ["Category", "Total Items", "Total Before Tax", "Promotion Discounts", "Coupon Discounts", "Unwashable", "Tax", "Extra Services", "Total", "Returned", "Total remaining (Total - Returned)", "Due", "Total Customers"];
}

/** Reference's "export all" sheet: each branch's title, its table, then its total row. */
export async function detailedSalesReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await detailedSalesReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير المبيعات التفصيلي" : "Detailed Sales Report", { views: [{ rightToLeft: isAr }] });
  const headers = detailedSalesHeaders(isAr);
  const width = headers.length;
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(report.filters, isAr)], width, `${report.startDate} ~ ${report.endDate}`);
  const values = (x: Record<Key, string> & { customers: number }) => [...KEYS.map((k) => Number(x[k])), x.customers];
  for (const b of report.branches) {
    sheet.mergeCells(r, 1, r, width);
    sheet.getCell(r, 1).value = `${isAr ? b.branchNameAr || b.branchName : b.branchName} (${b.branchCode})`;
    sheet.getCell(r, 1).font = { bold: true };
    sheet.getCell(r, 1).alignment = { horizontal: "center" };
    r++;
    sheet.getRow(r).values = headers;
    styleHeaderRow(sheet, r, width);
    r++;
    for (const row of b.rows) {
      sheet.getRow(r).values = [isAr ? row.nameAr || row.nameEn : row.nameEn, ...values(row)];
      r++;
    }
    sheet.getRow(r).values = [isAr ? "المجموع" : "Total", ...values(b.totals)];
    sheet.getRow(r).font = { bold: true };
    r += 2;
  }
  if (report.branches.length === 0) {
    sheet.mergeCells(r, 1, r, width);
    sheet.getCell(r, 1).value = isAr ? "تأكد من عوامل التصفية." : "Make sure of your filters.";
  }
  sheet.getColumn(1).width = 26;
  for (let c = 2; c <= width; c++) {
    sheet.getColumn(c).width = 15;
    if (c !== width) sheet.getColumn(c).numFmt = "#,##0.00";
  }
  return { workbook, filename: xlsxFilename("Detailed_Sales_Report") };
}
