import ExcelJS from "exceljs";
import { Prisma, type CompensationStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { saleScopeWhere, parseAppScope,
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

/**
 * Reference's "Compensations Report" (ReportController@compensationReportDetails +
 * report/compensations_report.blade.php): one row per compensation (reparation) in the period -
 * date, status, customer "name / mobile", invoice no., location, type, total items and the
 * compensation amount. Filters: Location Group, Business Location, Customer Group, Date Range,
 * Status, Contact (a picked contact wins over the customer group, as in the reference).
 *
 * Statuses and types are this app's compensation workflow (Pending / Approved / Rejected / Paid;
 * Cash / Points / Coupon / Cashback resolution) rather than the reference's pending / confirmed /
 * completed. The amount is the approved amount once approved, else the claimed one.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Total Items is the real item count (the reference passes a number to a view that only counts
 *    arrays, so it always shows 0).
 *  - Only the caller's permitted branches (the reference's location list ignores permissions).
 */

export const COMPENSATION_STATUSES: CompensationStatus[] = ["PENDING", "APPROVED", "REJECTED", "PAID"];

export async function compensationsReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const customerGroupId = query.customerGroupId ? String(query.customerGroupId) : undefined;
  const customerId = query.customerId ? String(query.customerId) : undefined;
  const status = query.status ? (String(query.status) as CompensationStatus) : undefined;
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  const [rowsRaw, customerGroup, customer] = await Promise.all([
    prisma.compensation.findMany({
      where: {
        organizationId,
        businessLocationId: { in: locations.map((l) => l.id) },
        createdAt: { gte: from, lte: to },
        ...(customerId ? { customerId } : customerGroupId ? { customer: { customerGroupId } } : {}),
        ...(status ? { status } : {}),
        ...(scope ? { sale: saleScopeWhere(scope) } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        status: true,
        resolutionType: true,
        claimedAmount: true,
        approvedAmount: true,
        customer: { select: { nameEn: true, nameAr: true, phone: true } },
        sale: { select: { invoiceNumber: true } },
        businessLocation: { select: { branchName: true, branchNameAr: true, branchCode: true } },
        _count: { select: { items: true } },
      },
    }),
    customerGroupId ? prisma.customerGroup.findFirst({ where: { id: customerGroupId, organizationId }, select: { nameEn: true, nameAr: true } }) : null,
    customerId ? prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { nameEn: true, nameAr: true, phone: true } }) : null,
  ]);

  let totalItems = 0;
  let totalAmount = new Decimal(0);
  const rows = rowsRaw.map((c) => {
    const amount = c.approvedAmount ?? c.claimedAmount;
    totalItems += c._count.items;
    totalAmount = totalAmount.add(amount);
    return {
      id: c.id,
      date: localDateTime(c.createdAt),
      status: c.status,
      customer: c.customer,
      invoiceNumber: c.sale.invoiceNumber,
      location: c.businessLocation,
      type: c.resolutionType,
      totalItems: c._count.items,
      amount: amount.toFixed(2),
    };
  });

  return { startDate, endDate, filters: { ...filters, customerGroup, customer, status: status ?? null }, rows, totals: { totalItems, amount: totalAmount.toFixed(2) } };
}

const STATUS_LABELS: Record<CompensationStatus, { en: string; ar: string }> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار" },
  APPROVED: { en: "Approved", ar: "موافق عليه" },
  REJECTED: { en: "Rejected", ar: "مرفوض" },
  PAID: { en: "Paid", ar: "مدفوع" },
};
const TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  CASH: { en: "Cash", ar: "نقدي" },
  POINTS: { en: "Points", ar: "نقاط" },
  COUPON: { en: "Coupon", ar: "قسيمة" },
  CASHBACK: { en: "Cashback", ar: "استرداد نقدي" },
};

export async function compensationsReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await compensationsReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const lang = isAr ? "ar" : "en";
  const name = (x: { nameEn: string; nameAr: string | null }) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير التعويضات" : "Compensations Report", { views: [{ rightToLeft: isAr }] });
  const headers = isAr
    ? ["التاريخ", "الحالة", "اسم العميل", "رقم الفاتورة", "الفرع", "النوع", "مجموع العناصر", "مبلغ التعويض"]
    : ["Date", "Status", "Customer Name", "Invoice No", "Location", "Type", "Total Items", "Compensations Amount"];
  const width = headers.length;
  const f = report.filters;
  const extra = [
    f.customerGroup ? `${isAr ? "مجموعة العملاء" : "Customer Group"}: ${name(f.customerGroup)}` : "",
    f.status ? `${isAr ? "الحالة" : "Status"}: ${STATUS_LABELS[f.status][lang]}` : "",
    f.customer ? `${isAr ? "جهة الاتصال" : "Contact"}: ${name(f.customer)} / ${f.customer.phone}` : "",
  ].filter(Boolean);
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(f, isAr, extra)], width, `${report.startDate} ~ ${report.endDate}`);
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  for (const row of report.rows) {
    sheet.getRow(r).values = [
      row.date,
      STATUS_LABELS[row.status][lang],
      `${name(row.customer)} / ${row.customer.phone}`,
      row.invoiceNumber ?? "",
      `${isAr ? row.location.branchNameAr || row.location.branchName : row.location.branchName} (${row.location.branchCode})`,
      row.type ? TYPE_LABELS[row.type][lang] : "",
      row.totalItems,
      Number(row.amount),
    ];
    r++;
  }
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", "", "", "", "", "", report.totals.totalItems, Number(report.totals.amount)];
  sheet.getRow(r).font = { bold: true };
  [18, 14, 30, 16, 26, 14, 14, 18].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  sheet.getColumn(8).numFmt = "#,##0.00";
  return { workbook, filename: xlsxFilename("Compensation_Report") };
}
