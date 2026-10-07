import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { itemScopeWhere, parseAppScope, parseReportLocationQuery, resolveReportLocations } from "./reportCommon";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

/**
 * Reference's "Sales Analysis Report" (ReportController@getSalesAnalysisReport +
 * report/sales_analysis_report.blade.php, Sales Reports dropdown): every branch - grouped by region,
 * with a TOTAL per region - showing MTD (the picked month) and YTD (January to that month) sales for
 * the picked year next to the comparison year, each with its LFL % change. Sales are the
 * reference's sell-line `quantity x unit_price` (after line discounts, before tax) = SaleItem.subtotal.
 * Filters: Location Group, Business Location, Year, Comparison Year, Month.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Comparison Year defaults to the year before (the reference's page pre-selects the same year,
 *    so the default comparison is against itself).
 *  - Amounts keep their decimals and LFL % one decimal place (the reference rounds both to integers).
 *  - LFL % is "-" when the comparison figure is zero (the reference prints 0%, which reads as "no
 *    change" rather than "no base").
 *  - A NET TOTAL closes the report (the reference styles a grand total row but never adds one).
 *  - A comparison year after the report year still works (the reference only reads years from the
 *    comparison year onward, so that combination drops the report year entirely).
 */

const yearMonthWindow = (year: number, fromMonth: number, toMonth: number) => ({
  gte: new Date(year, fromMonth - 1, 1),
  lte: new Date(year, toMonth, 0, 23, 59, 59, 999),
});

type Figures = { mtdCurr: Decimal; mtdPrev: Decimal; ytdCurr: Decimal; ytdPrev: Decimal };
const empty = (): Figures => ({ mtdCurr: new Decimal(0), mtdPrev: new Decimal(0), ytdCurr: new Decimal(0), ytdPrev: new Decimal(0) });
const lfl = (curr: Decimal, prev: Decimal) => (prev.gt(0) ? curr.sub(prev).div(prev).mul(100).toFixed(1) : null);
const format = (f: Figures) => ({
  mtdCurr: f.mtdCurr.toFixed(2),
  mtdPrev: f.mtdPrev.toFixed(2),
  mtdLfl: lfl(f.mtdCurr, f.mtdPrev),
  ytdCurr: f.ytdCurr.toFixed(2),
  ytdPrev: f.ytdPrev.toFixed(2),
  ytdLfl: lfl(f.ytdCurr, f.ytdPrev),
});

export async function salesAnalysisReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const now = new Date();
  const year = query.year ? Number(query.year) : now.getFullYear();
  const compareYear = query.compareYear ? Number(query.compareYear) : year - 1;
  const month = query.month ? Number(query.month) : now.getMonth() + 1;
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);
  const locationIds = locations.map((l) => l.id);

  const [items, groupInfo] = await Promise.all([
    prisma.saleItem.findMany({
      where: {
        ...itemScopeWhere(scope),
        sale: {
          organizationId,
          status: "FINAL",
          businessLocationId: { in: locationIds },
          OR: [{ saleDate: yearMonthWindow(year, 1, month) }, { saleDate: yearMonthWindow(compareYear, 1, month) }],
        },
      },
      select: { subtotal: true, sale: { select: { businessLocationId: true, saleDate: true } } },
    }),
    prisma.businessLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, group: { select: { id: true, nameEn: true, nameAr: true } } } }),
  ]);

  const byStore = new Map<string, Figures>();
  for (const i of items) {
    const d = i.sale.saleDate;
    const f = byStore.get(i.sale.businessLocationId) ?? empty();
    const isMonth = d.getMonth() + 1 === month;
    if (d.getFullYear() === year) {
      f.ytdCurr = f.ytdCurr.add(i.subtotal);
      if (isMonth) f.mtdCurr = f.mtdCurr.add(i.subtotal);
    }
    if (d.getFullYear() === compareYear) {
      f.ytdPrev = f.ytdPrev.add(i.subtotal);
      if (isMonth) f.mtdPrev = f.mtdPrev.add(i.subtotal);
    }
    byStore.set(i.sale.businessLocationId, f);
  }

  const groupOf = new Map(groupInfo.map((g) => [g.id, g.group]));
  const add = (a: Figures, b: Figures): Figures => ({ mtdCurr: a.mtdCurr.add(b.mtdCurr), mtdPrev: a.mtdPrev.add(b.mtdPrev), ytdCurr: a.ytdCurr.add(b.ytdCurr), ytdPrev: a.ytdPrev.add(b.ytdPrev) });
  type Region = { key: string; nameEn: string; nameAr: string | null; stores: ({ locationId: string; branchName: string; branchNameAr: string | null; branchCode: string } & ReturnType<typeof format>)[]; figures: Figures };
  const regions = new Map<string, Region>();
  let net = empty();
  for (const l of locations) {
    const f = byStore.get(l.id);
    // Reference: a store only appears when it has sales in the years read.
    if (!f) continue;
    const g = groupOf.get(l.id);
    const key = g?.id ?? "none";
    const region = regions.get(key) ?? { key, nameEn: g?.nameEn ?? "Others", nameAr: g?.nameAr ?? "أخرى", stores: [], figures: empty() };
    region.stores.push({ locationId: l.id, branchName: l.branchName, branchNameAr: l.branchNameAr, branchCode: l.branchCode, ...format(f) });
    region.figures = add(region.figures, f);
    regions.set(key, region);
    net = add(net, f);
  }

  return {
    year,
    compareYear,
    month,
    filters,
    regions: [...regions.values()]
      .sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.nameEn.localeCompare(b.nameEn)))
      .map((r) => ({ key: r.key, nameEn: r.nameEn, nameAr: r.nameAr, stores: r.stores, totals: format(r.figures) })),
    netTotal: format(net),
  };
}
