import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
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
import { accumulateCustomers, bestSellerNamer, branchDirectory, customerBaseRow, customerTotals, loadCustomerLines, type CustomerAcc } from "./crmCommon";

const { Decimal } = Prisma;

/**
 * Reference: CRM Reports > New Customers Report (ReportController@getNewCustomersReport +
 * report/new_customers_report.blade.php). The customers registered in the Date Range, each with
 * their purchases so far (all time): Customer, Mobile, Region, Store, Transactions, Units, Basket
 * Size, Sales, Best Seller Service. Filters: Location Group, Business Location, Customer Group,
 * Customer, Promotion, Date Range (registration date).
 *
 * As in the reference, a newly registered customer who hasn't bought yet is listed with zeros -
 * unless a branch / location group or a promotion is chosen, which by definition asks about their
 * purchases there (the reference's branch / promotion conditions dropped non-buyers the same way).
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Rows show without first picking a filter, and Store / Region / Best Seller Service are the
 *    customer's most-used branch and most-bought category (see crmCommon.ts) - the same fixes as
 *    the Customers Revenue Report.
 *  - Promotion matches the invoice's promotion (a Cash back promotion discounts no line).
 *  - In Service POS / Product POS a customer who only bought the other app's items isn't listed;
 *    one who hasn't bought anything yet still is (customers are shared by every app).
 */
export async function newCustomersReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const customerGroupId = query.customerGroupId ? String(query.customerGroupId) : undefined;
  const customerId = query.customerId ? String(query.customerId) : undefined;
  const promotionId = query.promotionId ? String(query.promotionId) : undefined;
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  const customerSelect = { id: true, code: true, nameEn: true, nameAr: true, businessName: true, phone: true, createdAt: true } as const;
  const [registered, customerGroup, customer, promotion, branches] = await Promise.all([
    prisma.customer.findMany({
      where: {
        organizationId,
        deletedAt: null,
        createdAt: { gte: from, lte: to },
        ...(customerId ? { id: customerId } : {}),
        ...(customerGroupId ? { customerGroupId } : {}),
      },
      select: customerSelect,
    }),
    customerGroupId ? prisma.customerGroup.findFirst({ where: { id: customerGroupId, organizationId }, select: { nameEn: true, nameAr: true } }) : null,
    customerId ? prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { nameEn: true, nameAr: true, phone: true } }) : null,
    promotionId ? prisma.promotion.findFirst({ where: { id: promotionId, organizationId }, select: { name: true } }) : null,
    branchDirectory(organizationId),
  ]);
  const ids = registered.map((c) => c.id);

  const lines = ids.length
    ? await loadCustomerLines({ organizationId, locationIds: locations.map((l) => l.id), scope, customerIds: ids, promotionId })
    : [];
  const { byCustomer, tree } = await accumulateCustomers(organizationId, lines);
  const bestSeller = await bestSellerNamer(organizationId, tree);

  // Not bought yet (anywhere, any app) - listed with zeros unless the filters are about purchases.
  const purchaseFilter = Boolean(q.locationGroupId || q.locationIds?.length || promotionId);
  let neverBought: typeof registered = [];
  if (!purchaseFilter && ids.length) {
    const buyers = await prisma.sale.findMany({ where: { organizationId, status: "FINAL", customerId: { in: ids } }, select: { customerId: true }, distinct: ["customerId"] });
    const buyerIds = new Set(buyers.map((b) => b.customerId));
    neverBought = registered.filter((c) => !buyerIds.has(c.id));
  }
  const empty = (c: (typeof registered)[number]): CustomerAcc => ({
    customer: c,
    sales: new Set(),
    units: new Decimal(0),
    amount: new Decimal(0),
    byLocation: new Map(),
    byCategory: new Map(),
    buckets: new Map(),
  });

  const rows = [...byCustomer.values(), ...neverBought.map(empty)]
    .map((acc) => ({ ...customerBaseRow(acc, branches), bestSeller: bestSeller(acc) }))
    .sort((a, b) => Number(b.sales) - Number(a.sales) || a.customer.nameEn.localeCompare(b.customer.nameEn));

  return { startDate, endDate, filters: { ...filters, customerGroup, customer, promotion }, rows, totals: customerTotals(rows) };
}

export async function newCustomersReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await newCustomersReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير العملاء الجدد" : "New Customers Report", { views: [{ rightToLeft: isAr }] });
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
  return { workbook, filename: xlsxFilename("New_Customers_Report") };
}
