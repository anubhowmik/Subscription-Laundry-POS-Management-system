import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { saleScopeWhere, parseAppScope, localToday, parseReportLocationQuery, resolveReportLocations } from "./reportCommon";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

/**
 * Reference's "Daily Sales Report" (ReportController@getDailySalesReport + report/daily_sales_report.blade.php,
 * under the Sales Reports dropdown): for one day, every branch that sold - grouped by region
 * (location group) - with sales before tax, total sales, transactions, units, basket size
 * (sales / transactions), ASP (sales / units) and growth % against the same date a year earlier,
 * then a TOTAL per region and a NET TOTAL. Filters: Date, Location Group, Business Location.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Amounts keep their decimals (the reference casts every figure with (int), truncating money).
 *  - Sales and last year's sales are measured the same way - each invoice's total - so growth
 *    compares like with like (the reference compares this year's line totals against last year's
 *    invoice totals, so any invoice discount or delivery charge skews the %).
 *  - Branches with no location group are listed under "No Group" (the reference's inner join to
 *    location groups silently drops them).
 *  - Last year's sales respect the caller's permitted branches (the reference reads every branch's).
 */

/** Same calendar date one year earlier; 29 Feb falls back to 28 Feb. */
export function sameDateLastYear(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const last = new Date(y - 1, m, 0).getDate();
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

const dayWindow = (ymd: string) => ({ gte: new Date(`${ymd}T00:00:00`), lte: new Date(`${ymd}T23:59:59.999`) });

interface Figures {
  salesBeforeTax: Decimal;
  sales: Decimal;
  transactions: number;
  units: Decimal;
}

function format(f: Figures, prevSales?: Decimal) {
  const div = (a: Decimal, b: Decimal | number) => (new Decimal(b).gt(0) ? a.div(b).toFixed(2) : "0.00");
  return {
    salesBeforeTax: f.salesBeforeTax.toFixed(2),
    sales: f.sales.toFixed(2),
    transactions: f.transactions,
    units: f.units.toFixed(2),
    basketSize: div(f.sales, f.transactions),
    asp: div(f.sales, f.units),
    growth: prevSales === undefined || !prevSales.gt(0) ? null : f.sales.sub(prevSales).div(prevSales).mul(100).toFixed(2),
  };
}

const empty = (): Figures => ({ salesBeforeTax: new Decimal(0), sales: new Decimal(0), transactions: 0, units: new Decimal(0) });
const add = (a: Figures, b: Figures): Figures => ({
  salesBeforeTax: a.salesBeforeTax.add(b.salesBeforeTax),
  sales: a.sales.add(b.sales),
  transactions: a.transactions + b.transactions,
  units: a.units.add(b.units),
});

export async function dailySalesReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const date = query.date ? String(query.date) : localToday();
  const prevDate = sameDateLastYear(date);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);
  const locationIds = locations.map((l) => l.id);

  const [sales, prevSales, groupInfo] = await Promise.all([
    prisma.sale.findMany({
      where: { organizationId, status: "FINAL", businessLocationId: { in: locationIds }, saleDate: dayWindow(date), ...saleScopeWhere(scope) },
      select: { businessLocationId: true, totalAmount: true, taxAmount: true, items: { select: { quantity: true } } },
    }),
    prisma.sale.groupBy({
      by: ["businessLocationId"],
      where: { organizationId, status: "FINAL", businessLocationId: { in: locationIds }, saleDate: dayWindow(prevDate), ...saleScopeWhere(scope) },
      _sum: { totalAmount: true },
    }),
    prisma.businessLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, group: { select: { id: true, nameEn: true, nameAr: true } } } }),
  ]);

  const byStore = new Map<string, Figures>();
  for (const s of sales) {
    const f = byStore.get(s.businessLocationId) ?? empty();
    f.sales = f.sales.add(s.totalAmount);
    f.salesBeforeTax = f.salesBeforeTax.add(s.totalAmount.sub(s.taxAmount));
    f.transactions += 1;
    f.units = f.units.add(s.items.reduce((a, i) => a.add(i.quantity), new Decimal(0)));
    byStore.set(s.businessLocationId, f);
  }
  const prevByStore = new Map(prevSales.map((p) => [p.businessLocationId, p._sum.totalAmount ?? new Decimal(0)]));
  const groupOf = new Map(groupInfo.map((g) => [g.id, g.group]));

  type Region = { key: string; nameEn: string; nameAr: string | null; stores: ReturnType<typeof storeRow>[]; figures: Figures };
  const storeRow = (l: (typeof locations)[number], f: Figures) => ({
    locationId: l.id,
    branchName: l.branchName,
    branchNameAr: l.branchNameAr,
    branchCode: l.branchCode,
    ...format(f, prevByStore.get(l.id)),
  });
  const regions = new Map<string, Region>();
  let net = empty();
  for (const l of locations) {
    const f = byStore.get(l.id);
    // Reference: only branches that sold on the day appear.
    if (!f) continue;
    const g = groupOf.get(l.id);
    const key = g?.id ?? "none";
    const region = regions.get(key) ?? { key, nameEn: g?.nameEn ?? "No Group", nameAr: g?.nameAr ?? "بدون مجموعة", stores: [], figures: empty() };
    region.stores.push(storeRow(l, f));
    region.figures = add(region.figures, f);
    regions.set(key, region);
    net = add(net, f);
  }

  return {
    date,
    previousDate: prevDate,
    filters,
    // Reference orders regions by name.
    regions: [...regions.values()]
      .sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.nameEn.localeCompare(b.nameEn)))
      .map((r) => ({ key: r.key, nameEn: r.nameEn, nameAr: r.nameAr, stores: r.stores, totals: format(r.figures) })),
    netTotal: format(net),
  };
}
