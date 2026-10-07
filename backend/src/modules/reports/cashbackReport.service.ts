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
 * Reference's "Cash Back Report" (ReportController@cashBackReportDetails + report/cashBack_report.blade.php):
 * one row per cashback movement in the period - date, status (Granted / Redeemed), customer
 * "name / mobile", invoice no., location, transaction type and the cashback amount. Filters:
 * Location Group, Business Location, Customer Group, Date Range, Contact (a picked contact wins
 * over the customer group).
 *
 * Transaction type is where the movement came from - "Sell" (redeemed at checkout),
 * "Compensation" (a compensation paid out as cashback) or "Manual" (a staff grant/adjustment). As
 * in the reference, manual movements have no branch and are always listed; the others are kept to
 * the picked / permitted branches (the invoice's branch, or the compensation's).
 */

export async function cashbackReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const customerGroupId = query.customerGroupId ? String(query.customerGroupId) : undefined;
  const customerId = query.customerId ? String(query.customerId) : undefined;
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);
  const locationIds = locations.map((l) => l.id);

  const [rowsRaw, customerGroup, customer] = await Promise.all([
    prisma.cashbackTransaction.findMany({
      where: {
        organizationId,
        createdAt: { gte: from, lte: to },
        ...(customerId ? { customerId } : customerGroupId ? { customer: { customerGroupId } } : {}),
        OR: [
          { saleId: null, compensationId: null },
          { sale: { businessLocationId: { in: locationIds } } },
          { saleId: null, compensation: { businessLocationId: { in: locationIds } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        amount: true,
        saleId: true,
        compensationId: true,
        customer: { select: { nameEn: true, nameAr: true, phone: true } },
        sale: { select: { invoiceNumber: true, businessLocation: { select: { branchName: true, branchNameAr: true, branchCode: true } } } },
        compensation: { select: { sale: { select: { invoiceNumber: true } }, businessLocation: { select: { branchName: true, branchNameAr: true, branchCode: true } } } },
      },
    }),
    customerGroupId ? prisma.customerGroup.findFirst({ where: { id: customerGroupId, organizationId }, select: { nameEn: true, nameAr: true } }) : null,
    customerId ? prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { nameEn: true, nameAr: true, phone: true } }) : null,
  ]);

  const rows = rowsRaw.map((c) => ({
    id: c.id,
    date: localDateTime(c.createdAt),
    status: c.amount.gte(0) ? ("GRANTED" as const) : ("REDEEMED" as const),
    customer: c.customer,
    invoiceNumber: c.sale?.invoiceNumber ?? c.compensation?.sale.invoiceNumber ?? null,
    location: c.sale?.businessLocation ?? c.compensation?.businessLocation ?? null,
    transactionType: c.saleId ? ("SELL" as const) : c.compensationId ? ("COMPENSATION" as const) : ("MANUAL" as const),
    amount: c.amount.abs().toFixed(2),
  }));

  return { startDate, endDate, filters: { ...filters, customerGroup, customer }, rows };
}

const STATUS = { GRANTED: { en: "Granted", ar: "ممنوح" }, REDEEMED: { en: "Redeemed", ar: "مستبدل" } };
const TYPES = { SELL: { en: "Sell", ar: "بيع" }, COMPENSATION: { en: "Compensation", ar: "تعويض" }, MANUAL: { en: "Manual", ar: "يدوي" } };

export async function cashbackReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await cashbackReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const lang = isAr ? "ar" : "en";
  const name = (x: { nameEn: string; nameAr: string | null }) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير استرداد النقود" : "Cash Back Report", { views: [{ rightToLeft: isAr }] });
  const headers = isAr
    ? ["التاريخ", "الحالة", "اسم العميل", "رقم الفاتورة", "الفرع", "نوع المعاملة", "مقدار استرداد النقود"]
    : ["Date", "Status", "Customer Name", "Invoice No", "Location", "Transaction Type", "Cash Back Amount"];
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
      row.date,
      STATUS[row.status][lang],
      `${name(row.customer)} / ${row.customer.phone}`,
      row.invoiceNumber ?? "",
      row.location ? `${isAr ? row.location.branchNameAr || row.location.branchName : row.location.branchName} (${row.location.branchCode})` : "",
      TYPES[row.transactionType][lang],
      Number(row.amount),
    ];
    r++;
  }
  [18, 12, 30, 16, 26, 16, 18].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  sheet.getColumn(7).numFmt = "#,##0.00";
  return { workbook, filename: xlsxFilename("Cash_back_Report") };
}
