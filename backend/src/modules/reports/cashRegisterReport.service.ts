import ExcelJS from "exceljs";
import { Prisma, type RegisterSessionStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  localDateTime,
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
 * Reference's "Cash Register Report" (ReportController@cashRegisterReportDetails +
 * report/cashRegister_report.blade.php): one row per cash register session - branch, sells,
 * discounts, tax, total, returned, total remaining, customers, cash and card payments, and the
 * session's "open to close" period - with a "Created By" (the viewer) footer. Filters: Location
 * Group, Date Range, Status (open / close).
 *
 * A session's figures are the FINAL invoices rung up under it, computed like the Branches Sales
 * Report (sells = after discounts, before tax). Deliberate deviations, each fixing a reference
 * defect:
 *  - "Sales" is the sales amount (the reference prints the item quantity under that heading).
 *  - Sums are taken once per invoice (the reference joins sell lines x payments, multiplying every
 *    total by the number of payments / lines).
 *  - Closed sessions are matched on their close date, open ones on their open date (the reference
 *    filters every status on closed_at, so open registers can never appear), and "All" statuses
 *    is allowed (the reference requires one).
 *  - Only permitted branches (the reference ignores the user's locations).
 */

const zero = () => new Decimal(0);
const KEYS = ["sells", "discounts", "tax", "total", "returned", "remaining", "cash", "card"] as const;
type Key = (typeof KEYS)[number];

export async function cashRegisterReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const status: RegisterSessionStatus | undefined = query.status === "open" ? "OPEN" : query.status === "close" ? "CLOSED" : undefined;
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations({ ...q, locationIds: [] }, organizationId, allowedLocationIds);

  const sessions = await prisma.registerSession.findMany({
    where: {
      organizationId,
      businessLocationId: { in: locations.map((l) => l.id) },
      ...(status === "CLOSED"
        ? { status, closedAt: { gte: from, lte: to } }
        : status === "OPEN"
          ? { status, openedAt: { gte: from, lte: to } }
          : { OR: [{ status: "CLOSED", closedAt: { gte: from, lte: to } }, { status: "OPEN", openedAt: { gte: from, lte: to } }] }),
    },
    orderBy: { openedAt: "desc" },
    select: {
      id: true,
      openedAt: true,
      closedAt: true,
      status: true,
      businessLocation: { select: { branchName: true, branchNameAr: true, branchCode: true } },
      sales: {
        where: { status: "FINAL" },
        select: {
          customerId: true,
          discountAmount: true,
          taxAmount: true,
          totalAmount: true,
          items: { select: { quantity: true, unitPrice: true } },
          sellReturns: { select: { totalAmount: true } },
          payments: { where: { type: "SALE_PAYMENT" }, select: { amount: true, paymentMethod: { select: { code: true } } } },
        },
      },
    },
  });

  const totals = { ...(Object.fromEntries(KEYS.map((k) => [k, zero()])) as Record<Key, Decimal>), customers: 0 };
  const rows = sessions.map((s) => {
    const a = Object.fromEntries(KEYS.map((k) => [k, zero()])) as Record<Key, Decimal>;
    const customers = new Set<string>();
    for (const sale of s.sales) {
      const gross = sale.items.reduce((x, i) => x.add(i.quantity.mul(i.unitPrice)), zero()).toDecimalPlaces(2);
      const returned = sale.sellReturns.reduce((x, r) => x.add(r.totalAmount), zero());
      a.sells = a.sells.add(gross.sub(sale.discountAmount));
      a.discounts = a.discounts.add(sale.discountAmount);
      a.tax = a.tax.add(sale.taxAmount);
      a.total = a.total.add(sale.totalAmount);
      a.returned = a.returned.add(returned);
      a.remaining = a.remaining.add(sale.totalAmount.sub(returned));
      for (const p of sale.payments) {
        if (p.paymentMethod.code === "CASH") a.cash = a.cash.add(p.amount);
        if (p.paymentMethod.code === "CARD") a.card = a.card.add(p.amount);
      }
      customers.add(sale.customerId);
    }
    for (const k of KEYS) totals[k] = totals[k].add(a[k]);
    totals.customers += customers.size;
    return {
      id: s.id,
      location: s.businessLocation,
      status: s.status,
      period: `${localDateTime(s.openedAt)} ${s.closedAt ? `- ${localDateTime(s.closedAt)}` : ""}`.trim(),
      openedAt: localDateTime(s.openedAt),
      closedAt: s.closedAt ? localDateTime(s.closedAt) : null,
      customers: customers.size,
      ...(Object.fromEntries(KEYS.map((k) => [k, a[k].toFixed(2)])) as Record<Key, string>),
    };
  });

  return {
    startDate,
    endDate,
    filters: { ...filters, status: status ?? null },
    rows,
    totals: { ...(Object.fromEntries(KEYS.map((k) => [k, totals[k].toFixed(2)])) as Record<Key, string>), customers: totals.customers },
  };
}

export async function cashRegisterReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null, viewerName: string) {
  const report = await cashRegisterReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير المناوبات" : "Cash Register Report", { views: [{ rightToLeft: isAr }] });
  const headers = isAr
    ? ["فرع", "المبيعات", "خصومات", "الضريبة", "المجموع", "تم ارجاعها", "المتبقى", "إجمالي العملاء", "المدفوعات النقدية", "المدفوعات ببطاقات الائتمانية", "التاريخ"]
    : ["Branch", "Sales", "Discounts", "Tax", "Total", "Returned", "Total remaining", "Total Customers", "Cash Payments", "Card Payments", "Date"];
  const width = headers.length;
  const extra = report.filters.status ? [`${isAr ? "الحالة" : "Status"}: ${report.filters.status === "OPEN" ? (isAr ? "مفتوح" : "Open") : isAr ? "مغلق" : "Close"}`] : [];
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(report.filters, isAr, extra)], width, `${report.startDate} ~ ${report.endDate}`);
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  const nums = (x: Record<Key, string> & { customers: number }) => [Number(x.sells), Number(x.discounts), Number(x.tax), Number(x.total), Number(x.returned), Number(x.remaining), x.customers, Number(x.cash), Number(x.card)];
  for (const row of report.rows) {
    sheet.getRow(r).values = [`${isAr ? row.location.branchNameAr || row.location.branchName : row.location.branchName} (${row.location.branchCode})`, ...nums(row), row.period];
    r++;
  }
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", ...nums(report.totals)];
  sheet.getRow(r).font = { bold: true };
  r++;
  sheet.mergeCells(r, 1, r, width);
  sheet.getCell(r, 1).value = `${isAr ? "أنشئ بواسطة" : "Created By"}: ${viewerName}`;
  sheet.getColumn(1).width = 26;
  for (let c = 2; c <= 10; c++) {
    sheet.getColumn(c).width = 15;
    if (c !== 8) sheet.getColumn(c).numFmt = "#,##0.00";
  }
  sheet.getColumn(11).width = 36;
  return { workbook, filename: xlsxFilename("Cash_Register_Report") };
}
