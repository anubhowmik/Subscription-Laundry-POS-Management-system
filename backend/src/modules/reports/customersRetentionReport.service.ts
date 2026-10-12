import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  customerLabel,
  localToday,
  locationFiltersText,
  parseAppScope,
  parseReportLocationQuery,
  pickName,
  reportHeaderText,
  resolveReportLocations,
  styleHeaderRow,
  writeSheetHeader,
  xlsxFilename,
} from "./reportCommon";
import { accumulateCustomers, branchDirectory, customerBaseRow, customerTotals, loadCustomerLines } from "./crmCommon";

const { Decimal } = Prisma;

/**
 * Reference: CRM Reports > Customers Retention Report (ReportController@getCustomersRetentionReport
 * + report/customers_retention_report.blade.php). Given a Date Point, the six Monday-Sunday weeks
 * before it (Week 1 = the week before the point's week ... Week 6), one row per customer who
 * bought in them: Customer, Mobile, Region, Store, Transactions, Units, Basket Size, Sales, then
 * the customer's sales in each of the six weeks - so you can see who keeps coming back.
 * Filters: Location Group, Business Location, Customer Group, Customer, Date Point.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Transactions / Units / Basket Size / Sales cover exactly the six weeks shown. The reference
 *    summed from Week 6 up to the Date Point itself, so the point's own (partial) week was in the
 *    totals but in no week column - the weeks never added up to Sales.
 *  - Rows show without first picking a filter, only customers who bought in the six weeks are
 *    listed, and Store / Region is the branch they used most (see crmCommon.ts) - the same fixes as
 *    the Customers Revenue Report.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Carbon's subWeeks(i)->startOfWeek()/endOfWeek(): Monday 00:00 to Sunday 23:59:59.999. */
export function retentionWeeks(datePoint: string) {
  const point = new Date(`${datePoint}T12:00:00`);
  return [1, 2, 3, 4, 5, 6].map((i) => {
    const day = new Date(point);
    day.setDate(day.getDate() - 7 * i);
    const start = new Date(day);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { index: i, start, end, startDate: ymd(start), endDate: ymd(end), label: `${pad(start.getDate())}/${pad(start.getMonth() + 1)} - ${pad(end.getDate())}/${pad(end.getMonth() + 1)}` };
  });
}

/**
 * Reference: CRM Reports > Decline Customers Report (ReportController@getDeclineCustomersReport) -
 * the same six weeks and columns as Customers Retention, listing only customers who are dropping
 * away: they bought in Weeks 2-6 but not in Week 1 (the most recent full week), and haven't come
 * back since (nothing in the Date Point's own week up to the point either).
 *
 * The reference meant exactly this - its comments say "the customer stopped before the last week"
 * - but it treated Week 6 as the latest week. Its weeks are counted backwards (Week 6 is the
 * oldest), so it actually listed customers who skipped the OLDEST week: mostly new customers, the
 * opposite of declining ones. Its "zero the weeks after the last active one" step was a no-op for
 * the same reason, and its totals also ran up to the Date Point (see the retention note above).
 */
export type CustomerWeeksMode = "retention" | "decline";

export async function customersRetentionReport(
  query: Record<string, unknown>,
  organizationId: string,
  allowedLocationIds: string[] | null,
  mode: CustomerWeeksMode = "retention",
) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const customerGroupId = query.customerGroupId ? String(query.customerGroupId) : undefined;
  const customerId = query.customerId ? String(query.customerId) : undefined;
  const datePoint = query.datePoint ? String(query.datePoint) : localToday();
  const weeks = retentionWeeks(datePoint);
  const from = weeks[5].start;
  const to = weeks[0].end;
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  const [lines, customerGroup, customer, branches] = await Promise.all([
    loadCustomerLines({ organizationId, locationIds: locations.map((l) => l.id), from, to, scope, customerId, customerGroupId }),
    customerGroupId ? prisma.customerGroup.findFirst({ where: { id: customerGroupId, organizationId }, select: { nameEn: true, nameAr: true } }) : null,
    customerId ? prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { nameEn: true, nameAr: true, phone: true } }) : null,
    branchDirectory(organizationId),
  ]);
  const weekOf = (line: { sale: { saleDate: Date } }) => {
    const w = weeks.find((x) => line.sale.saleDate >= x.start && line.sale.saleDate <= x.end);
    return w ? `w${w.index}` : null;
  };
  const { byCustomer } = await accumulateCustomers(organizationId, lines, weekOf);

  let rows = [...byCustomer.values()]
    .map((acc) => ({
      ...customerBaseRow(acc, branches),
      weeks: weeks.map((w) => (acc.buckets.get(`w${w.index}`) ?? new Decimal(0)).toFixed(2)),
    }))
    .sort((a, b) => Number(b.sales) - Number(a.sales) || a.customer.nameEn.localeCompare(b.customer.nameEn));

  if (mode === "decline") {
    // Came back after Week 1 - in the Date Point's own week, up to the point itself.
    const pointEnd = new Date(`${datePoint}T23:59:59.999`);
    const returned = new Set(
      (
        await loadCustomerLines({
          organizationId,
          locationIds: locations.map((l) => l.id),
          from: new Date(to.getTime() + 1),
          to: pointEnd,
          scope,
          customerId,
          customerGroupId,
        })
      ).map((l) => l.sale.customer.id),
    );
    rows = rows.filter((r) => Number(r.weeks[0]) === 0 && !returned.has(r.customerId));
  }

  return {
    datePoint,
    weeks: weeks.map(({ index, startDate, endDate, label }) => ({ index, startDate, endDate, label })),
    filters: { ...filters, customerGroup, customer },
    rows,
    totals: {
      ...customerTotals(rows),
      weeks: weeks.map((_, i) => rows.reduce((s, r) => s.add(r.weeks[i]), new Decimal(0)).toFixed(2)),
    },
  };
}

export async function customersRetentionReportXlsx(
  query: Record<string, unknown>,
  organizationId: string,
  allowedLocationIds: string[] | null,
  mode: CustomerWeeksMode = "retention",
) {
  const report = await customersRetentionReport(query, organizationId, allowedLocationIds, mode);
  const isAr = query.lang === "ar";
  const workbook = new ExcelJS.Workbook();
  const title =
    mode === "decline"
      ? isAr
        ? "تقرير معدل انخفاض العملاء"
        : "Decline Customers Report"
      : isAr
        ? "تقرير معدل الاحتفاظ بالعميل"
        : "Customers Retention Report";
  const sheet = workbook.addWorksheet(title, { views: [{ rightToLeft: isAr }] });
  const weekWord = isAr ? "الأسبوع" : "Week";
  const headers = [
    ...(isAr
      ? ["#", "العميل", "الموبايل", "المنطقة", "موقع العمل", "المعاملات", "الوحدات", "متوسط السله", "المبيعات"]
      : ["SR.No", "Customer", "Mobile", "Region", "Store", "Transactions", "Units", "Basket Size", "Sales"]),
    ...report.weeks.map((w) => `${weekWord} ${w.index} (${w.label})`),
  ];
  const width = headers.length;
  const f = report.filters;
  const extra = [
    `${isAr ? "التاريخ" : "Date Point"}: ${report.datePoint}`,
    f.customerGroup ? `${isAr ? "مجموعة العملاء" : "Customer Group"}: ${pickName(f.customerGroup, isAr)}` : "",
    f.customer ? `${isAr ? "العميل" : "Customer"}: ${pickName(f.customer, isAr)} / ${f.customer.phone}` : "",
  ].filter(Boolean);
  const range = `${report.weeks[5].startDate} ~ ${report.weeks[0].endDate}`;
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(f, isAr, extra)], width, range);
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  report.rows.forEach((row, i) => {
    sheet.getRow(r).values = [
      i + 1,
      customerLabel(row.customer, isAr),
      row.customer.phone,
      row.region ? pickName(row.region, isAr) : "",
      row.store ? `${isAr ? row.store.branchNameAr || row.store.branchName : row.store.branchName} (${row.store.branchCode})` : "",
      row.transactions,
      Number(row.units),
      Number(row.basketSize),
      Number(row.sales),
      ...row.weeks.map(Number),
    ];
    r++;
  });
  const t = report.totals;
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", "", "", "", "", t.transactions, Number(t.units), Number(t.basketSize), Number(t.sales), ...t.weeks.map(Number)];
  sheet.getRow(r).font = { bold: true };
  [8, 28, 16, 16, 26, 14, 12, 12, 14, 20, 20, 20, 20, 20, 20].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  for (let c = 8; c <= width; c++) sheet.getColumn(c).numFmt = "#,##0.00";
  return { workbook, filename: xlsxFilename(mode === "decline" ? "Decline_Customers_Report" : "Customers_Retention_Report") };
}
