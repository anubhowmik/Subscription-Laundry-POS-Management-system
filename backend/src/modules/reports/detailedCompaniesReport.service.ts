import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";
import { saleScopeWhere, parseAppScope,
  localDateTime,
  locationFiltersText,
  parseReportLocationQuery,
  pickName,
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
 * Reference's "Detailed Companies Report" (ReportController@getDetailedCompanyReport +
 * report/detailed_company_report.blade.php): one row per invoice made for a customer group
 * (`transactions.customer_group_id IS NOT NULL`), newest first, with its items, before-tax,
 * discount, tax, extra services, total, cashier and a "qty name, ..." products list.
 *
 * Column formulas follow the reference: before tax = sum(qty x unit price before discount);
 * discount = line + invoice discounts; extra services = total - (before tax + tax) + discount
 * (i.e. delivery and additional charges). Deliberate deviations, each fixing a reference defect:
 *  - Only FINAL invoices (the reference keeps everything except shipping_status 'ordered').
 *  - Footer totals cover the six amount columns (the reference's footerCallback sums columns 3-8,
 *    i.e. the Customer Group / Customer text columns, and never totals Extra Services or Total).
 *  - Every customer group is offered (the reference lists only `is_corporate` groups; this app
 *    has no such flag - a customer group is the corporate account here).
 */

export async function detailedCompaniesReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const customerGroupId = query.customerGroupId ? String(query.customerGroupId) : undefined;
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  let customerGroup: { nameEn: string; nameAr: string | null } | null = null;
  if (customerGroupId) {
    customerGroup = await prisma.customerGroup.findFirst({ where: { id: customerGroupId, organizationId }, select: { nameEn: true, nameAr: true } });
    if (!customerGroup) throw new NotFoundError("Customer group not found");
  }

  const sales = await prisma.sale.findMany({
    where: {
      organizationId,
      status: "FINAL",
      businessLocationId: { in: locations.map((l) => l.id) },
      saleDate: { gte: from, lte: to },
      customerGroupId: customerGroupId ?? { not: null },
      ...saleScopeWhere(scope),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      saleDate: true,
      taxAmount: true,
      discountAmount: true,
      totalAmount: true,
      businessLocation: { select: { branchName: true, branchNameAr: true, branchCode: true } },
      customerGroup: { select: { nameEn: true, nameAr: true } },
      customer: { select: { nameEn: true, nameAr: true, customField1: true } },
      createdByUser: { select: { fullNameEn: true, fullNameAr: true } },
      items: { select: { quantity: true, unitPrice: true, descriptionEn: true, descriptionAr: true } },
    },
  });

  const zero = () => new Decimal(0);
  const totals = { totalItems: zero(), beforeTax: zero(), discount: zero(), tax: zero(), extraServices: zero(), total: zero() };
  const rows = sales.map((s) => {
    const totalItems = s.items.reduce((a, i) => a.add(i.quantity), zero());
    const beforeTax = s.items.reduce((a, i) => a.add(i.quantity.mul(i.unitPrice)), zero()).toDecimalPlaces(2);
    const extraServices = s.totalAmount.sub(beforeTax).sub(s.taxAmount).add(s.discountAmount);
    const amounts = { totalItems, beforeTax, discount: s.discountAmount, tax: s.taxAmount, extraServices, total: s.totalAmount };
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = totals[k].add(amounts[k]);
    return {
      id: s.id,
      branchName: s.businessLocation.branchName,
      branchNameAr: s.businessLocation.branchNameAr,
      branchCode: s.businessLocation.branchCode,
      invoiceNumber: s.invoiceNumber,
      date: localDateTime(s.saleDate),
      customerGroup: s.customerGroup,
      customer: s.customer,
      createdBy: s.createdByUser,
      ...productsNames(s.items),
      totalItems: totalItems.toFixed(2),
      beforeTax: beforeTax.toFixed(2),
      discount: s.discountAmount.toFixed(2),
      tax: s.taxAmount.toFixed(2),
      extraServices: extraServices.toFixed(2),
      total: s.totalAmount.toFixed(2),
    };
  });

  return {
    startDate,
    endDate,
    filters: { ...filters, customerGroup },
    rows,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toFixed(2)])) as Record<keyof typeof totals, string>,
  };
}

export function detailedCompaniesColumns(isAr: boolean) {
  return isAr
    ? ["موقع العمل", "رقم الفاتورة", "التاريخ", "مجموعة العملاء", "العميل", "مجموع العناصر", "الاجمالى قبل الضريبة", "الخصم", "الضريبة", "خدمات اضافيه", "المجموع", "انشأ من قبل", "المنتجات"]
    : ["Business Location", "Invoice No.", "Date", "Customer Group", "Customer", "Total Items", "Total Before Tax", "Discount", "Tax", "Extra Services", "Total", "Created By", "Products"];
}

export async function detailedCompaniesReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await detailedCompaniesReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const extra = report.filters.customerGroup ? [`${isAr ? "مجموعة العملاء" : "Customer Group"}: ${pickName(report.filters.customerGroup, isAr)}`] : [];
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير الشركات التفصيلي" : "Detailed Companies Report", { views: [{ rightToLeft: isAr }] });
  const headers = detailedCompaniesColumns(isAr);
  const width = headers.length;
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(report.filters, isAr, extra)], width, `${report.startDate} ~ ${report.endDate}`);
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  for (const row of report.rows) {
    const customer = row.customer ? `${pickName(row.customer, isAr)}${row.customer.customField1 ? ` (${row.customer.customField1})` : ""}` : "-";
    sheet.getRow(r).values = [
      `${isAr ? row.branchNameAr || row.branchName : row.branchName} (${row.branchCode})`,
      row.invoiceNumber ?? "",
      row.date,
      row.customerGroup ? pickName(row.customerGroup, isAr) : "",
      customer,
      Number(row.totalItems),
      Number(row.beforeTax),
      Number(row.discount),
      Number(row.tax),
      Number(row.extraServices),
      Number(row.total),
      row.createdBy ? (isAr ? row.createdBy.fullNameAr || row.createdBy.fullNameEn : row.createdBy.fullNameEn) : "",
      isAr ? row.productsAr : row.productsEn,
    ];
    r++;
  }
  const t = report.totals;
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", "", "", "", "", ...[t.totalItems, t.beforeTax, t.discount, t.tax, t.extraServices, t.total].map(Number)];
  sheet.getRow(r).font = { bold: true };
  [28, 16, 18, 20, 26, 12, 16, 12, 12, 14, 14, 20, 50].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  for (let c = 6; c <= 11; c++) sheet.getColumn(c).numFmt = "#,##0.00";
  return { workbook, filename: xlsxFilename("Detailed_Companies_Report") };
}
