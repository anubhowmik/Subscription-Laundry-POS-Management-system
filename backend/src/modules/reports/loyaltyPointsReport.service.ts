import ExcelJS from "exceljs";
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

/**
 * Reference's "Loyality Points Report" (ReportController@rewardPointsReportDetails +
 * report/loyalityPoints_report.blade.php): reward-point movements in the period grouped by
 * invoice - invoice no., transaction date, points earned, points redeemed, customer
 * "name / mobile" and location. Filters: Location Group, Business Location, Customer Group, Date
 * Range, Contact (a picked contact wins over the customer group).
 *
 * As in the reference, only movements tied to an invoice count (manual adjustments have no
 * invoice / branch), and the period is the movement's own date. Rows are newest first.
 */

export async function loyaltyPointsReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const customerGroupId = query.customerGroupId ? String(query.customerGroupId) : undefined;
  const customerId = query.customerId ? String(query.customerId) : undefined;
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  const [movements, customerGroup, customer] = await Promise.all([
    prisma.loyaltyTransaction.findMany({
      where: {
        organizationId,
        type: { in: ["EARN", "REDEEM"] },
        createdAt: { gte: from, lte: to },
        sale: { businessLocationId: { in: locations.map((l) => l.id) } },
        ...(customerId ? { customerId } : customerGroupId ? { customer: { customerGroupId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        type: true,
        points: true,
        customer: { select: { nameEn: true, nameAr: true, phone: true } },
        sale: { select: { id: true, invoiceNumber: true, saleDate: true, businessLocation: { select: { branchName: true, branchNameAr: true, branchCode: true } } } },
      },
    }),
    customerGroupId ? prisma.customerGroup.findFirst({ where: { id: customerGroupId, organizationId }, select: { nameEn: true, nameAr: true } }) : null,
    customerId ? prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { nameEn: true, nameAr: true, phone: true } }) : null,
  ]);

  const bySale = new Map<string, { id: string; invoiceNumber: string | null; date: string; earned: number; redeemed: number; customer: (typeof movements)[number]["customer"]; location: NonNullable<(typeof movements)[number]["sale"]>["businessLocation"] }>();
  let earned = 0;
  let redeemed = 0;
  for (const m of movements) {
    const sale = m.sale!;
    const row = bySale.get(sale.id) ?? { id: sale.id, invoiceNumber: sale.invoiceNumber, date: localDateTime(sale.saleDate), earned: 0, redeemed: 0, customer: m.customer, location: sale.businessLocation };
    const pts = Math.abs(m.points);
    if (m.type === "EARN") row.earned += pts;
    else row.redeemed += pts;
    if (m.type === "EARN") earned += pts;
    else redeemed += pts;
    bySale.set(sale.id, row);
  }

  return { startDate, endDate, filters: { ...filters, customerGroup, customer }, rows: [...bySale.values()], totals: { earned, redeemed } };
}

export async function loyaltyPointsReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await loyaltyPointsReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const name = (x: { nameEn: string; nameAr: string | null }) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير نقاط الولاء" : "Loyality Points Report", { views: [{ rightToLeft: isAr }] });
  const headers = isAr
    ? ["رقم الفاتورة", "تاريخ العملية", "النقاط المكتسبة", "النقاط المستبدلة", "اسم العميل", "الفرع"]
    : ["Invoice No", "Transaction Date", "Reward Points Earned", "Reward Points Redeemed", "Customer Name", "Location"];
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
      row.invoiceNumber ?? "",
      row.date,
      row.earned,
      row.redeemed,
      `${name(row.customer)} / ${row.customer.phone}`,
      `${isAr ? row.location.branchNameAr || row.location.branchName : row.location.branchName} (${row.location.branchCode})`,
    ];
    r++;
  }
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", "", report.totals.earned, report.totals.redeemed];
  sheet.getRow(r).font = { bold: true };
  [16, 18, 18, 20, 30, 26].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  return { workbook, filename: xlsxFilename("Loyalty_Points_Report") };
}
