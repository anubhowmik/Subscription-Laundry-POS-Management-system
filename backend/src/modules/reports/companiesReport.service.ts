import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";
import { saleScopeWhere, parseAppScope,
  locationFiltersText,
  parseReportLocationQuery,
  pickName,
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
 * Reference's "Companies Report" (ReportController@getCompanyReport + report/company_report.blade.php
 * + BusinessLocation::report_data): one row per branch with its sales and sell returns - optionally
 * only those made for one customer group (the invoice's own `customer_group_id` snapshot, here
 * Sale/SellReturn.customerGroupId) - split into before-tax / tax / total, plus the net.
 *
 * Deliberate deviations from the reference, each fixing a confirmed reference defect:
 *  - Before-tax and tax come from each invoice's stored tax, not `total / 1.15` - the reference's
 *    hardcoded 15% is wrong for zero-rated/exempt lines and untaxed pass-through charges.
 *  - Only FINAL sales count (the reference sums every `type='sell'` row, drafts and quotations included).
 *  - No branch picked = every permitted branch (the reference renders an empty table).
 */

interface Amounts {
  beforeTax: string;
  tax: string;
  total: string;
  returnBeforeTax: string;
  returnTax: string;
  returnTotal: string;
  net: string;
}

export async function companiesReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const customerGroupId = query.customerGroupId ? String(query.customerGroupId) : undefined;
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);
  const locationIds = locations.map((l) => l.id);

  let customerGroup: { nameEn: string; nameAr: string | null } | null = null;
  if (customerGroupId) {
    customerGroup = await prisma.customerGroup.findFirst({ where: { id: customerGroupId, organizationId }, select: { nameEn: true, nameAr: true } });
    if (!customerGroup) throw new NotFoundError("Customer group not found");
  }

  const [sales, returns] = await Promise.all([
    prisma.sale.groupBy({
      by: ["businessLocationId"],
      where: {
        organizationId,
        status: "FINAL",
        businessLocationId: { in: locationIds },
        saleDate: { gte: from, lte: to },
        ...(customerGroupId ? { customerGroupId } : {}),
        ...saleScopeWhere(scope),
      },
      _sum: { totalAmount: true, taxAmount: true },
    }),
    prisma.sellReturn.groupBy({
      by: ["businessLocationId"],
      where: {
        organizationId,
        businessLocationId: { in: locationIds },
        returnDate: { gte: from, lte: to },
        ...(customerGroupId ? { customerGroupId } : {}),
        ...(scope ? { sale: saleScopeWhere(scope) } : {}),
      },
      _sum: { totalAmount: true, taxAmount: true },
    }),
  ]);
  const saleBy = new Map(sales.map((s) => [s.businessLocationId, s._sum]));
  const returnBy = new Map(returns.map((r) => [r.businessLocationId, r._sum]));

  const zero = () => new Decimal(0);
  const totals = { beforeTax: zero(), tax: zero(), total: zero(), returnBeforeTax: zero(), returnTax: zero(), returnTotal: zero(), net: zero() };
  const fmt = (o: typeof totals): Amounts => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toFixed(2)])) as unknown as Amounts;

  const rows = [];
  for (const location of locations) {
    const s = saleBy.get(location.id);
    const r = returnBy.get(location.id);
    const total = s?.totalAmount ?? zero();
    const tax = s?.taxAmount ?? zero();
    const returnTotal = r?.totalAmount ?? zero();
    const returnTax = r?.taxAmount ?? zero();
    // Reference: a branch row only appears when it had sales or returns.
    if (total.eq(0) && returnTotal.eq(0)) continue;
    const row = {
      beforeTax: total.sub(tax),
      tax,
      total,
      returnBeforeTax: returnTotal.sub(returnTax),
      returnTax,
      returnTotal,
      net: total.sub(returnTotal),
    };
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = totals[k].add(row[k]);
    rows.push({ locationId: location.id, branchName: location.branchName, branchNameAr: location.branchNameAr, branchCode: location.branchCode, ...fmt(row) });
  }

  return { startDate, endDate, filters: { ...filters, customerGroup }, rows, totals: fmt(totals) };
}

export async function companiesReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await companiesReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const extra = report.filters.customerGroup ? [`${isAr ? "مجموعة العملاء" : "Customer Group"}: ${pickName(report.filters.customerGroup, isAr)}`] : [];
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير الشركات" : "Companies Report", { views: [{ rightToLeft: isAr }] });
  const headers = companiesColumns(isAr);
  const width = headers.length;
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(report.filters, isAr, extra)], width, `${report.startDate} ~ ${report.endDate}`);
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  if (report.rows.length === 0) {
    sheet.mergeCells(r, 1, r, width);
    sheet.getCell(r, 1).value = isAr ? "تأكد من عوامل التصفية." : "Make sure of your filters.";
    r++;
  }
  const values = (a: Amounts) => [a.beforeTax, a.tax, a.total, a.returnBeforeTax, a.returnTax, a.returnTotal, a.net].map(Number);
  for (const row of report.rows) {
    sheet.getRow(r).values = [`${isAr ? row.branchNameAr || row.branchName : row.branchName} (${row.branchCode})`, ...values(row)];
    r++;
  }
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", ...values(report.totals)];
  sheet.getRow(r).font = { bold: true };
  sheet.getColumn(1).width = 30;
  for (let c = 2; c <= width; c++) {
    sheet.getColumn(c).width = 16;
    sheet.getColumn(c).numFmt = "#,##0.00";
  }
  return { workbook, filename: xlsxFilename("Companies_Report") };
}

/** Reference headings - its three return columns are hardcoded Arabic in both languages; shown
 * translated here. */
function companiesColumns(isAr: boolean) {
  return isAr
    ? ["موقع العمل", "الاجمالى قبل الضريبة", "الضريبة", "المجموع", "مرتجع قبل الضريبة", "ضريبة المرتجع", "إجمالي المرتجع", "الصافي"]
    : ["Business Location", "Total Before Tax", "Tax", "Total", "Return before tax", "Return tax", "Total return", "Net"];
}
