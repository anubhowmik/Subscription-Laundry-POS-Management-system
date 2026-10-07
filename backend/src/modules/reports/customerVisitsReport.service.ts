import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { itemScopeWhere, saleScopeWhere, parseAppScope,
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

/**
 * Reference's "Customer Visits Report" (ReportController@CustomerVisitsReport +
 * report/customer_visits_report.blade.php): one row per customer who bought in the period - name,
 * mobile, branch, city, the items bought, invoice total and visit count (number of invoices) - plus
 * two summary ratios: repeat customers (more than one visit) as a share of all customers, and as a
 * share of the period's visiting customers. Filters: Location Group, Business Location, Date Range,
 * Customer Group, Contact.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Total is the sum of each invoice once (the reference sums final_total per joined sell line,
 *    multiplying it by the invoice's line count).
 *  - The last day of the range is included (the reference compares a datetime against a bare end
 *    date, dropping everything after midnight of that day).
 *  - "All customers" counts this business's customers only (the reference counts every business's).
 *  - A customer seen at several branches lists all of them (the reference shows an arbitrary one),
 *    and items are products and services alike.
 */

export async function customerVisitsReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const customerGroupId = query.customerGroupId ? String(query.customerGroupId) : undefined;
  const customerId = query.customerId ? String(query.customerId) : undefined;
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  const [sales, totalCustomers, customerGroup, customer] = await Promise.all([
    prisma.sale.findMany({
      where: {
        organizationId,
        status: "FINAL",
        businessLocationId: { in: locations.map((l) => l.id) },
        saleDate: { gte: from, lte: to },
        ...(customerId ? { customerId } : customerGroupId ? { customer: { customerGroupId } } : {}),
        ...saleScopeWhere(scope),
      },
      orderBy: { saleDate: "asc" },
      select: {
        totalAmount: true,
        customer: { select: { id: true, nameEn: true, nameAr: true, businessName: true, phone: true } },
        businessLocation: { select: { id: true, branchName: true, branchNameAr: true, branchCode: true, city: true } },
        items: { where: itemScopeWhere(scope), select: { descriptionEn: true, descriptionAr: true } },
      },
    }),
    prisma.customer.count({ where: { organizationId } }),
    customerGroupId ? prisma.customerGroup.findFirst({ where: { id: customerGroupId, organizationId }, select: { nameEn: true, nameAr: true } }) : null,
    customerId ? prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { nameEn: true, nameAr: true, phone: true } }) : null,
  ]);

  type Loc = (typeof sales)[number]["businessLocation"];
  const byCustomer = new Map<string, { customer: (typeof sales)[number]["customer"]; locations: Map<string, Loc>; productsEn: Set<string>; productsAr: Set<string>; total: Prisma.Decimal; visits: number }>();
  for (const s of sales) {
    const row = byCustomer.get(s.customer.id) ?? { customer: s.customer, locations: new Map(), productsEn: new Set(), productsAr: new Set(), total: new Decimal(0), visits: 0 };
    row.locations.set(s.businessLocation.id, s.businessLocation);
    for (const i of s.items) {
      row.productsEn.add(i.descriptionEn);
      row.productsAr.add(i.descriptionAr || i.descriptionEn);
    }
    row.total = row.total.add(s.totalAmount);
    row.visits++;
    byCustomer.set(s.customer.id, row);
  }

  const rows = [...byCustomer.values()]
    .sort((a, b) => b.visits - a.visits || a.customer.nameEn.localeCompare(b.customer.nameEn))
    .map((r) => ({
      customerId: r.customer.id,
      customer: r.customer,
      locations: [...r.locations.values()].map((l) => ({ branchName: l.branchName, branchNameAr: l.branchNameAr, branchCode: l.branchCode, city: l.city })),
      productsEn: [...r.productsEn].join(", "),
      productsAr: [...r.productsAr].join("، "),
      total: r.total.toFixed(2),
      visits: r.visits,
    }));
  const repeated = rows.filter((r) => r.visits > 1).length;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10000) / 100 : 0);

  return {
    startDate,
    endDate,
    filters: { ...filters, customerGroup, customer },
    rows,
    totals: { total: rows.reduce((a, r) => a.add(r.total), new Decimal(0)).toFixed(2), visits: rows.reduce((a, r) => a + r.visits, 0) },
    summary: { repeatedCustomers: repeated, visitingCustomers: rows.length, totalCustomers, repeatedVsTotal: pct(repeated, totalCustomers), repeatedVsVisitors: pct(repeated, rows.length) },
  };
}

export async function customerVisitsReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await customerVisitsReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const name = (x: { nameEn: string; nameAr: string | null }) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير زيارات العملاء" : "Customer Visits Report", { views: [{ rightToLeft: isAr }] });
  const headers = isAr ? ["الاسم", "الموبايل", "موقع العمل", "المدينة", "المنتجات", "المجموع", "عدد الزيارات"] : ["Name", "Mobile", "Business Location", "City", "Products", "Total", "Visit Count"];
  const width = headers.length;
  const f = report.filters;
  const extra = [
    f.customerGroup ? `${isAr ? "مجموعة العملاء" : "Customer Group"}: ${name(f.customerGroup)}` : "",
    f.customer ? `${isAr ? "جهة الاتصال" : "Contact"}: ${name(f.customer)} / ${f.customer.phone}` : "",
  ].filter(Boolean);
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(f, isAr, extra)], width, `${report.startDate} ~ ${report.endDate}`);
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  for (const row of report.rows) {
    sheet.getRow(r).values = [
      `${row.customer.businessName ? `${row.customer.businessName}, ` : ""}${name(row.customer)}`,
      row.customer.phone,
      row.locations.map((l) => `${isAr ? l.branchNameAr || l.branchName : l.branchName} (${l.branchCode})`).join(", "),
      [...new Set(row.locations.map((l) => l.city).filter(Boolean))].join(", "),
      isAr ? row.productsAr : row.productsEn,
      Number(row.total),
      row.visits,
    ];
    r++;
  }
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", "", "", "", "", Number(report.totals.total), report.totals.visits];
  sheet.getRow(r).font = { bold: true };
  r++;
  const s = report.summary;
  for (const line of [
    `${isAr ? "نسبة العملاء المتكررين من إجمالي عملاء النظام" : "Repeat customers out of all customers"}: ${s.repeatedVsTotal}%`,
    `${isAr ? "نسبة العملاء المتكررين من الزائرين خلال الفترة" : "Repeat customers out of the period's visitors"}: ${s.repeatedVsVisitors}%`,
  ]) {
    sheet.mergeCells(r, 1, r, width);
    sheet.getCell(r, 1).value = line;
    sheet.getCell(r, 1).alignment = { horizontal: "center" };
    sheet.getCell(r, 1).font = { bold: true };
    r++;
  }
  [28, 16, 28, 16, 50, 14, 12].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  sheet.getColumn(6).numFmt = "#,##0.00";
  return { workbook, filename: xlsxFilename("Customer_Visits_Report") };
}
