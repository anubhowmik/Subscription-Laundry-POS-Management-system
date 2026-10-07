import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { itemScopeWhere, saleScopeWhere, parseAppScope, locationFiltersText, parseReportLocationQuery, productCategoryTree, reportDateWindow, reportHeaderText, resolveReportLocations, xlsxFilename } from "./reportCommon";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

/**
 * Reference's "Daily Products Report" (ReportController@getDailyReport +
 * report/daily_products_report.blade.php): one row per branch, one QT/TA column pair per item sold
 * (or per category on the second tab), for the chosen branches and date range.
 *
 * Deliberate deviations from the reference, each fixing a confirmed reference defect:
 *  - Only FINAL sales count. The reference filters `type='sell'` with no status check, so draft
 *    quotations/deliveries are counted as sales too.
 *  - The categories tab's footer totals are its own. The reference never resets its running
 *    $to_total_sales/$to_total_customers between the two tabs, so that footer comes out doubled.
 *  - "All" location groups with no branch picked means every permitted branch. In the reference
 *    that combination either can't be submitted (the select is `required`) or crashes
 *    (`$locations` is still a plain array when ->pluck() runs).
 * Items here are both products and services (a laundry item is a Service in this app), and
 * categories are product categories plus service categories.
 */

interface Cell {
  qty: Decimal;
  amount: Decimal;
}

export async function dailyProductsReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);
  const locationIds = locations.map((l) => l.id);
  const tree = await productCategoryTree(organizationId);

  const sales = await prisma.sale.findMany({
    where: { organizationId, status: "FINAL", businessLocationId: { in: locationIds }, saleDate: { gte: from, lte: to }, ...saleScopeWhere(scope) },
    select: {
      id: true,
      businessLocationId: true,
      customerId: true,
      totalAmount: true,
      items: {
        where: itemScopeWhere(scope),
        select: {
          quantity: true,
          subtotal: true,
          taxAmount: true,
          product: { select: { id: true, nameEn: true, nameAr: true, category: { select: { id: true, nameEn: true, nameAr: true } } } },
          service: { select: { id: true, nameEn: true, nameAr: true, category: { select: { id: true, nameEn: true, nameAr: true } } } },
        },
      },
    },
  });

  const items = new Map<string, { key: string; nameEn: string; nameAr: string | null }>();
  const categories = new Map<string, { key: string; nameEn: string; nameAr: string | null }>();
  const perLocation = new Map<
    string,
    { lineSales: Decimal; saleTotal: Decimal; customers: Set<string>; items: Map<string, Cell>; categories: Map<string, Cell> }
  >();
  for (const id of locationIds) {
    perLocation.set(id, { lineSales: new Decimal(0), saleTotal: new Decimal(0), customers: new Set(), items: new Map(), categories: new Map() });
  }

  const addCell = (map: Map<string, Cell>, key: string, qty: Decimal, amount: Decimal) => {
    const cell = map.get(key) ?? { qty: new Decimal(0), amount: new Decimal(0) };
    map.set(key, { qty: cell.qty.add(qty), amount: cell.amount.add(amount) });
  };

  for (const sale of sales) {
    const loc = perLocation.get(sale.businessLocationId)!;
    loc.saleTotal = loc.saleTotal.add(sale.totalAmount);
    loc.customers.add(sale.customerId);
    for (const line of sale.items) {
      const thing = line.product ?? line.service;
      if (!thing) continue;
      const itemKey = `${line.product ? "p" : "s"}:${thing.id}`;
      items.set(itemKey, { key: itemKey, nameEn: thing.nameEn, nameAr: thing.nameAr });
      // Reference: quantity * unit_price + quantity * item_tax. Built from subtotal + tax rather than
      // the stored line `total`, which older product lines saved without their VAT.
      const amount = line.subtotal.add(line.taxAmount);
      loc.lineSales = loc.lineSales.add(amount);
      addCell(loc.items, itemKey, line.quantity, amount);
      // Product categories roll up to their top-level category, as the reference's p.category_id does.
      const category = line.product && thing.category ? tree.topOf(thing.category.id) ?? thing.category : thing.category;
      if (category) {
        const catKey = `${line.product ? "pc" : "sc"}:${category.id}`;
        categories.set(catKey, { key: catKey, nameEn: category.nameEn, nameAr: category.nameAr });
        addCell(loc.categories, catKey, line.quantity, amount);
      }
    }
  }

  const itemList = [...items.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  const categoryList = [...categories.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));

  const buildTab = (columns: { key: string }[], salesOf: (l: NonNullable<ReturnType<typeof perLocation.get>>) => Decimal, cellsOf: (l: NonNullable<ReturnType<typeof perLocation.get>>) => Map<string, Cell>) => {
    const totals = { sales: new Decimal(0), customers: 0, cells: new Map<string, Cell>() };
    const rows = [];
    for (const location of locations) {
      const l = perLocation.get(location.id)!;
      const locationSales = salesOf(l);
      // Reference skips a branch row entirely when it had no sales in the range.
      if (locationSales.eq(0)) continue;
      totals.sales = totals.sales.add(locationSales);
      totals.customers += l.customers.size;
      const cells: Record<string, { qty: string; amount: string }> = {};
      for (const c of columns) {
        const cell = cellsOf(l).get(c.key) ?? { qty: new Decimal(0), amount: new Decimal(0) };
        cells[c.key] = { qty: cell.qty.toFixed(2), amount: cell.amount.toFixed(2) };
        addCell(totals.cells, c.key, cell.qty, cell.amount);
      }
      rows.push({
        locationId: location.id,
        branchName: location.branchName,
        branchNameAr: location.branchNameAr,
        branchCode: location.branchCode,
        sales: locationSales.toFixed(2),
        customers: l.customers.size,
        cells,
      });
    }
    return {
      rows,
      totals: {
        sales: totals.sales.toFixed(2),
        customers: totals.customers,
        cells: Object.fromEntries(columns.map((c) => {
          const cell = totals.cells.get(c.key) ?? { qty: new Decimal(0), amount: new Decimal(0) };
          return [c.key, { qty: cell.qty.toFixed(2), amount: cell.amount.toFixed(2) }];
        })),
      },
    };
  };

  return {
    startDate,
    endDate,
    filters,
    items: itemList,
    categories: categoryList,
    // Products tab "Sales" = sum of line totals (reference: quantity * unit_price + item tax);
    // categories tab "Sales" = sum of invoice totals (reference: transactions.final_total).
    byProducts: buildTab(itemList, (l) => l.lineSales, (l) => l.items),
    byCategories: buildTab(categoryList, (l) => l.saleTotal, (l) => l.categories),
  };
}

// ---------------------------------------------------------------------------
// Excel - reference's "Generate Excel File" (whole report) and each tab's "Export" button
// ---------------------------------------------------------------------------

type ReportData = Awaited<ReturnType<typeof dailyProductsReport>>;

function addTabSheet(
  workbook: ExcelJS.Workbook,
  title: string,
  report: ReportData,
  tab: "byProducts" | "byCategories",
  isAr: boolean,
  headerLines: string[],
) {
  const sheet = workbook.addWorksheet(title, { views: [{ rightToLeft: isAr }] });
  const columns = tab === "byProducts" ? report.items : report.categories;
  const data = report[tab];
  const width = 3 + columns.length * 2;
  const name = (x: { nameEn: string; nameAr: string | null }) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
  let r = 1;

  for (const line of headerLines.filter(Boolean)) {
    sheet.mergeCells(r, 1, r, width);
    sheet.getCell(r, 1).value = line;
    sheet.getCell(r, 1).alignment = { horizontal: "center" };
    r++;
  }
  sheet.mergeCells(r, 1, r, width);
  sheet.getCell(r, 1).value = `${report.startDate} ~ ${report.endDate}`;
  sheet.getCell(r, 1).alignment = { horizontal: "center" };
  sheet.getCell(r, 1).font = { bold: true };
  r++;

  const head1 = r;
  const head2 = r + 1;
  const fixed = isAr ? ["الموقع", "المبيعات", "إجمالي العملاء"] : ["Business Location", "Sales", "Total Customers"];
  fixed.forEach((label, i) => {
    sheet.mergeCells(head1, i + 1, head2, i + 1);
    sheet.getCell(head1, i + 1).value = label;
  });
  columns.forEach((c, i) => {
    const col = 4 + i * 2;
    sheet.mergeCells(head1, col, head1, col + 1);
    sheet.getCell(head1, col).value = name(c);
    sheet.getCell(head2, col).value = "QT";
    sheet.getCell(head2, col + 1).value = "TA";
  });
  for (const rowNo of [head1, head2]) {
    const row = sheet.getRow(rowNo);
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 1; c <= width; c++) {
      sheet.getCell(rowNo, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF263BAA" } };
    }
  }
  r = head2 + 1;

  if (data.rows.length === 0) {
    sheet.mergeCells(r, 1, r, width);
    sheet.getCell(r, 1).value = isAr ? "تأكد من عوامل التصفية." : "Make sure of your filters.";
    r++;
  }
  for (const row of data.rows) {
    const values: (string | number)[] = [`${isAr ? row.branchNameAr || row.branchName : row.branchName} (${row.branchCode})`, Number(row.sales), row.customers];
    for (const c of columns) values.push(Number(row.cells[c.key].qty), Number(row.cells[c.key].amount));
    sheet.getRow(r).values = values;
    r++;
  }
  if (columns.length > 0) {
    const totals: (string | number)[] = [isAr ? "المجموع" : "Total", Number(data.totals.sales), data.totals.customers];
    for (const c of columns) totals.push(Number(data.totals.cells[c.key].qty), Number(data.totals.cells[c.key].amount));
    sheet.getRow(r).values = totals;
    sheet.getRow(r).font = { bold: true };
  }

  sheet.getColumn(1).width = 28;
  for (let c = 2; c <= width; c++) {
    sheet.getColumn(c).width = 14;
    if (c !== 3) sheet.getColumn(c).numFmt = "#,##0.00";
  }
}

export async function dailyProductsReportXlsx(
  query: Record<string, unknown>,
  organizationId: string,
  allowedLocationIds: string[] | null,
) {
  const report = await dailyProductsReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const headerLines = [await reportHeaderText(organizationId), locationFiltersText(report.filters, isAr)];

  const workbook = new ExcelJS.Workbook();
  const sheet = String(query.sheet ?? "all");
  if (sheet !== "categories") addTabSheet(workbook, isAr ? "حسب المنتجات" : "By Products", report, "byProducts", isAr, headerLines);
  if (sheet !== "products") addTabSheet(workbook, isAr ? "حسب الفئات" : "By Categories", report, "byCategories", isAr, headerLines);

  return { workbook, filename: xlsxFilename("Daily_Products_Report") };
}
