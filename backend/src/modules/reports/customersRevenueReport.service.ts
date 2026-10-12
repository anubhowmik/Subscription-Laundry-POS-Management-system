import ExcelJS from "exceljs";
import { prisma } from "../../config/prisma";
import {
  customerLabel,
  locationFiltersText,
  parseAppScope,
  parseReportLocationQuery,
  pickName,
  reportDateWindow,
  reportHeaderText,
  resolveReportLocations,
  styleHeaderRow,
  writeSheetHeader,
  xlsxFilename,
} from "./reportCommon";
import { accumulateCustomers, bestSellerNamer, branchDirectory, customerBaseRow, customerTotals, loadCustomerLines } from "./crmCommon";

/**
 * Reference: CRM Reports > Customers Revenue Report (ReportController@getCustomersRevenueReport +
 * report/customers_revenue_report.blade.php). One row per customer who bought in the period:
 * Customer, Mobile, Region, Store, Transactions, Units, Basket Size, Sales and Best Seller Service.
 * Filters: Location Group, Business Location, Customer Group, Customer, Promotion, Date Range.
 * Sales is the reference's quantity x unit_price - the line value after its discount, before tax.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Rows show without first picking a filter (the reference returns an empty table until a
 *    group / branch / customer / promotion is chosen) - every other report here opens filled.
 *  - Only customers who bought in the period are listed. The reference left-joins every customer,
 *    so filtering by customer group listed buyers and non-buyers alike, while a branch filter
 *    silently dropped the non-buyers - two different meanings of the same report.
 *  - Store / Region is the branch the customer bought from most in the period (the reference
 *    printed the alphabetically last branch and region name, MAX(bl.name)).
 *  - Best Seller Service is the customer's most-bought category (the reference printed the
 *    alphabetically last category name, MAX(cat.name)).
 *  - Promotion matches the invoice's promotion, so a Cash back promotion (which discounts no line)
 *    filters too; the reference looked only at sell lines' promotion_id.
 */

export async function customersRevenueReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const customerGroupId = query.customerGroupId ? String(query.customerGroupId) : undefined;
  const customerId = query.customerId ? String(query.customerId) : undefined;
  const promotionId = query.promotionId ? String(query.promotionId) : undefined;
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  const [lines, customerGroup, customer, promotion, branches] = await Promise.all([
    loadCustomerLines({ organizationId, locationIds: locations.map((l) => l.id), from, to, scope, customerId, customerGroupId, promotionId }),
    customerGroupId ? prisma.customerGroup.findFirst({ where: { id: customerGroupId, organizationId }, select: { nameEn: true, nameAr: true } }) : null,
    customerId ? prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { nameEn: true, nameAr: true, phone: true } }) : null,
    promotionId ? prisma.promotion.findFirst({ where: { id: promotionId, organizationId }, select: { name: true } }) : null,
    branchDirectory(organizationId),
  ]);
  const { byCustomer, tree } = await accumulateCustomers(organizationId, lines);
  const bestSeller = await bestSellerNamer(organizationId, tree);

  const rows = [...byCustomer.values()]
    .map((acc) => ({ ...customerBaseRow(acc, branches), bestSeller: bestSeller(acc) }))
    .sort((a, b) => Number(b.sales) - Number(a.sales) || a.customer.nameEn.localeCompare(b.customer.nameEn));

  return { startDate, endDate, filters: { ...filters, customerGroup, customer, promotion }, rows, totals: customerTotals(rows) };
}

export async function customersRevenueReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await customersRevenueReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير مبيعات العملاء" : "Customers Revenue Report", { views: [{ rightToLeft: isAr }] });
  const headers = isAr
    ? ["#", "العميل", "الموبايل", "المنطقة", "موقع العمل", "المعاملات", "الوحدات", "متوسط السله", "المبيعات", "الخدمة الأكثر مبيعاً"]
    : ["SR.No", "Customer", "Mobile", "Region", "Store", "Transactions", "Units", "Basket Size", "Sales", "Best Seller Service"];
  const width = headers.length;
  const f = report.filters;
  const extra = [
    f.customerGroup ? `${isAr ? "مجموعة العملاء" : "Customer Group"}: ${pickName(f.customerGroup, isAr)}` : "",
    f.customer ? `${isAr ? "العميل" : "Customer"}: ${pickName(f.customer, isAr)} / ${f.customer.phone}` : "",
    f.promotion ? `${isAr ? "العرض الترويجي" : "Promotion"}: ${f.promotion.name}` : "",
  ].filter(Boolean);
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(f, isAr, extra)], width, `${report.startDate} ~ ${report.endDate}`);
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
      row.bestSeller ? pickName(row.bestSeller, isAr) : "",
    ];
    r++;
  });
  const t = report.totals;
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", "", "", "", "", t.transactions, Number(t.units), Number(t.basketSize), Number(t.sales), ""];
  sheet.getRow(r).font = { bold: true };
  [8, 28, 16, 16, 26, 14, 12, 12, 14, 24].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  [8, 9].forEach((c) => (sheet.getColumn(c).numFmt = "#,##0.00"));
  return { workbook, filename: xlsxFilename("Customers_Revenue_Report") };
}
