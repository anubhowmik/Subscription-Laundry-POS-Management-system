import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { saleScopeWhere, parseAppScope,
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
 * Reference's "Branches Sales Report" (ReportController@getBranchSalesReport + BusinessLocation::
 * branches_report_data / branches_total_paid + report/branch_sales_report.blade.php): one row per
 * branch - its location group, sells (after discounts, before tax), discounts, unwashable
 * quantity, tax, extra services, total, returned, total remaining, due, customers, and the cash and
 * card amounts collected on those invoices (net of refunds). Filters: Location Group + Date Range.
 *
 * Same conventions as the Detailed Sales Report (whose per-branch totals these rows equal): only
 * FINAL invoices, invoice-level discounts/charges counted, unwashable = quantity returned as
 * NOT_WASHABLE, and Due from the invoice's own paid amount (the reference re-sums payments once
 * per joined row).
 */

const zero = () => new Decimal(0);
const KEYS = ["sells", "discounts", "unwashable", "tax", "extraServices", "total", "returned", "remaining", "due", "cash", "card"] as const;
type Key = (typeof KEYS)[number];

export async function branchSalesReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations({ ...q, locationIds: [] }, organizationId, allowedLocationIds);
  const groups = await prisma.businessLocation.findMany({
    where: { id: { in: locations.map((l) => l.id) } },
    select: { id: true, group: { select: { nameEn: true, nameAr: true } } },
  });
  const groupOf = new Map(groups.map((g) => [g.id, g.group]));

  const sales = await prisma.sale.findMany({
    where: { organizationId, status: "FINAL", businessLocationId: { in: locations.map((l) => l.id) }, saleDate: { gte: from, lte: to }, ...saleScopeWhere(scope) },
    select: {
      businessLocationId: true,
      customerId: true,
      discountAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      items: { select: { quantity: true, unitPrice: true, sellReturnItems: { select: { quantity: true, reason: true } } } },
      sellReturns: { select: { totalAmount: true } },
      payments: { select: { amount: true, type: true, paymentMethod: { select: { code: true } } } },
    },
  });

  type Acc = Record<Key, Decimal> & { qty: Decimal; customers: Set<string> };
  const accs = new Map<string, Acc>();
  for (const s of sales) {
    const a = accs.get(s.businessLocationId) ?? ({ ...(Object.fromEntries(KEYS.map((k) => [k, zero()])) as Record<Key, Decimal>), qty: zero(), customers: new Set<string>() } as Acc);
    const gross = s.items.reduce((x, i) => x.add(i.quantity.mul(i.unitPrice)), zero()).toDecimalPlaces(2);
    const returned = s.sellReturns.reduce((x, r) => x.add(r.totalAmount), zero());
    a.qty = a.qty.add(s.items.reduce((x, i) => x.add(i.quantity), zero()));
    a.sells = a.sells.add(gross.sub(s.discountAmount));
    a.discounts = a.discounts.add(s.discountAmount);
    a.unwashable = a.unwashable.add(s.items.flatMap((i) => i.sellReturnItems).filter((r) => r.reason === "NOT_WASHABLE").reduce((x, r) => x.add(r.quantity), zero()));
    a.tax = a.tax.add(s.taxAmount);
    a.extraServices = a.extraServices.add(s.totalAmount.sub(gross).sub(s.taxAmount).add(s.discountAmount));
    a.total = a.total.add(s.totalAmount);
    a.returned = a.returned.add(returned);
    a.remaining = a.remaining.add(s.totalAmount.sub(returned));
    a.due = a.due.add(s.totalAmount.sub(Decimal.min(s.paidAmount, s.totalAmount)));
    for (const p of s.payments) {
      const signed = p.type === "REFUND" ? p.amount.neg() : p.amount;
      if (p.paymentMethod.code === "CASH") a.cash = a.cash.add(signed);
      if (p.paymentMethod.code === "CARD") a.card = a.card.add(signed);
    }
    a.customers.add(s.customerId);
    accs.set(s.businessLocationId, a);
  }

  const totals = { ...(Object.fromEntries(KEYS.map((k) => [k, zero()])) as Record<Key, Decimal>), customers: 0 };
  const rows = [];
  for (const l of locations) {
    const a = accs.get(l.id);
    // Reference: a branch only appears when it sold something.
    if (!a || a.qty.eq(0)) continue;
    for (const k of KEYS) totals[k] = totals[k].add(a[k]);
    totals.customers += a.customers.size;
    rows.push({
      locationId: l.id,
      branchName: l.branchName,
      branchNameAr: l.branchNameAr,
      branchCode: l.branchCode,
      locationGroup: groupOf.get(l.id) ?? null,
      customers: a.customers.size,
      ...(Object.fromEntries(KEYS.map((k) => [k, a[k].toFixed(2)])) as Record<Key, string>),
    });
  }
  return {
    startDate,
    endDate,
    filters,
    rows,
    totals: { ...(Object.fromEntries(KEYS.map((k) => [k, totals[k].toFixed(2)])) as Record<Key, string>), customers: totals.customers },
  };
}

export async function branchSalesReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await branchSalesReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير ملخص مبيعات الفروع" : "Branches Sales Report", { views: [{ rightToLeft: isAr }] });
  const headers = isAr
    ? ["فرع", "مجموعات الفروع", "المبيعات", "خصومات", "غير قابل للغسيل", "الضريبة", "خدمات اضافيه", "المجموع", "تم ارجاعها", "المتبقى (المجموع - المرتجع)", "مستحق الدفع", "إجمالي العملاء", "المدفوعات النقدية", "المدفوعات ببطاقات الائتمانية"]
    : ["Branch", "Location Group", "Sales", "Discounts", "Unwashable", "Tax", "Extra Services", "Total", "Returned", "Total remaining (Total - Returned)", "Due", "Total Customers", "Cash Payments", "Card Payments"];
  const width = headers.length;
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(report.filters, isAr)], width, `${report.startDate} ~ ${report.endDate}`);
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  const nums = (x: Record<Key, string> & { customers: number }) => [
    ...(["sells", "discounts", "unwashable", "tax", "extraServices", "total", "returned", "remaining", "due"] as Key[]).map((k) => Number(x[k])),
    x.customers,
    Number(x.cash),
    Number(x.card),
  ];
  for (const row of report.rows) {
    const g = row.locationGroup;
    sheet.getRow(r).values = [isAr ? row.branchNameAr || row.branchName : row.branchName, g ? (isAr ? g.nameAr || g.nameEn : g.nameEn) : "", ...nums(row)];
    r++;
  }
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", "", ...nums(report.totals)];
  sheet.getRow(r).font = { bold: true };
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 18;
  for (let c = 3; c <= width; c++) {
    sheet.getColumn(c).width = 15;
    if (c !== 12) sheet.getColumn(c).numFmt = "#,##0.00";
  }
  return { workbook, filename: xlsxFilename("Branch_Sales_Report") };
}
