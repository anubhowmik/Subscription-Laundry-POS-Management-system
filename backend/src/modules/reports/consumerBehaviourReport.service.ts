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
import { accumulateCustomers, bestSellerNamer, branchDirectory, customerBaseRow, customerTotals, loadCustomerLines, type CustomerLine } from "./crmCommon";

/**
 * Reference: CRM Reports > Consumer Behaviour Report (ReportController@getConsumerBehaviourReport +
 * report/consumer_behaviour_report.blade.php). One row per customer who bought in the period:
 * Customer, Mobile, Region, Store, Transactions, Units, Basket Size, Sales, Best Time for Shopping,
 * Deal Type and Favourite Service. Filters: Customer Group (All Customers / Locations Customers /
 * a group - required, opens on All Customers), Location Group, Business Location, Customer, Date
 * Range (opens on this month).
 *
 * Best Time buckets: Morning 6-12, Afternoon 12-18, Evening 18-24, Night 0-6 (shop local time).
 * Deal Type: a line bought on a deal is one with a promotion or on an invoice with a coupon or
 * promotion - "Deals Only" when every line was, "Full Price Only" when none was, else "Mixed".
 * "Locations Customers" (the reference's ungrouped customers) are those with no customer group -
 * here also the auto-created Walk-in group, which is not a real customer group.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Best Time is the part of the day the customer shopped in most often (ties: the latest visit).
 *    The reference took only the hour of the customer's LAST invoice in the period.
 *  - Store / Region is the branch the customer bought from most, and Favourite Service the
 *    category they bought most units of (the reference printed the alphabetically last branch,
 *    region and category names - MAX(...)).
 *  - Deal Type also counts a Cash back promotion or a coupon recorded on the invoice; the reference
 *    looked only at sell lines' promotion_id / coupon_id.
 */

type Slot = "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT";
type DealType = "DEALS_ONLY" | "FULL_PRICE_ONLY" | "MIXED";

const slotOf = (d: Date): Slot => {
  const h = d.getHours();
  return h >= 6 && h < 12 ? "MORNING" : h >= 12 && h < 18 ? "AFTERNOON" : h >= 18 ? "EVENING" : "NIGHT";
};

export const SLOT_LABEL: Record<Slot, { en: string; ar: string }> = {
  MORNING: { en: "Morning (6-12)", ar: "صباحاً (6-12)" },
  AFTERNOON: { en: "Afternoon (12-18)", ar: "بعد الظهر (12-18)" },
  EVENING: { en: "Evening (18-24)", ar: "مساءً (18-24)" },
  NIGHT: { en: "Night (0-6)", ar: "ليلاً (0-6)" },
};
export const DEAL_LABEL: Record<DealType, { en: string; ar: string }> = {
  DEALS_ONLY: { en: "Deals Only", ar: "العروض فقط" },
  FULL_PRICE_ONLY: { en: "Full Price Only", ar: "السعر الكامل فقط" },
  MIXED: { en: "Mixed", ar: "مختلط" },
};

const isDeal = (line: CustomerLine) => Boolean(line.promotionId || line.sale.promotionId || line.sale.couponId);

/** "all" (default), "ungrouped" (Locations Customers) or a customer group id. */
async function customerGroupFilter(value: unknown, organizationId: string) {
  const v = value ? String(value) : "all";
  if (v === "all") return { kind: "all" as const };
  if (v === "ungrouped") {
    const walkIn = await prisma.customer.findFirst({ where: { organizationId, code: "WALKIN" }, select: { customerGroupId: true } });
    const where: Prisma.CustomerWhereInput = {
      OR: [{ customerGroupId: null }, ...(walkIn?.customerGroupId ? [{ customerGroupId: walkIn.customerGroupId }] : [])],
    };
    return { kind: "ungrouped" as const, where };
  }
  const group = await prisma.customerGroup.findFirst({ where: { id: v, organizationId }, select: { id: true, nameEn: true, nameAr: true } });
  return { kind: "group" as const, id: v, group };
}

export async function consumerBehaviourReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const customerId = query.customerId ? String(query.customerId) : undefined;
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const [{ locations, filters }, groupFilter] = await Promise.all([resolveReportLocations(q, organizationId, allowedLocationIds), customerGroupFilter(query.customerGroup, organizationId)]);

  const [lines, customer, branches] = await Promise.all([
    loadCustomerLines({
      organizationId,
      locationIds: locations.map((l) => l.id),
      from,
      to,
      scope,
      customerId,
      ...(groupFilter.kind === "group" ? { customerGroupId: groupFilter.id } : {}),
      ...(groupFilter.kind === "ungrouped" ? { customerWhere: groupFilter.where } : {}),
    }),
    customerId ? prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { nameEn: true, nameAr: true, phone: true } }) : null,
    branchDirectory(organizationId),
  ]);
  const { byCustomer, tree } = await accumulateCustomers(organizationId, lines);
  const favourite = await bestSellerNamer(organizationId, tree);

  // Per customer: each invoice's time (for Best Time) and deal / full-price line counts.
  const behaviour = new Map<string, { visits: Map<string, Date>; deals: number; fullPrice: number }>();
  for (const line of lines) {
    const b = behaviour.get(line.sale.customer.id) ?? { visits: new Map(), deals: 0, fullPrice: 0 };
    b.visits.set(line.saleId, line.sale.saleDate);
    if (isDeal(line)) b.deals++;
    else b.fullPrice++;
    behaviour.set(line.sale.customer.id, b);
  }
  const bestTime = (visits: Map<string, Date>): Slot | null => {
    const tally = new Map<Slot, { count: number; latest: number }>();
    for (const d of visits.values()) {
      const s = slotOf(d);
      const cur = tally.get(s) ?? { count: 0, latest: 0 };
      tally.set(s, { count: cur.count + 1, latest: Math.max(cur.latest, d.getTime()) });
    }
    return [...tally.entries()].sort((a, b) => b[1].count - a[1].count || b[1].latest - a[1].latest)[0]?.[0] ?? null;
  };
  const dealType = (deals: number, fullPrice: number): DealType => (deals > 0 && fullPrice === 0 ? "DEALS_ONLY" : fullPrice > 0 && deals === 0 ? "FULL_PRICE_ONLY" : "MIXED");

  const rows = [...byCustomer.values()]
    .map((acc) => {
      const b = behaviour.get(acc.customer.id)!;
      return { ...customerBaseRow(acc, branches), bestTime: bestTime(b.visits), dealType: dealType(b.deals, b.fullPrice), favouriteService: favourite(acc) };
    })
    .sort((a, b) => Number(b.sales) - Number(a.sales) || a.customer.nameEn.localeCompare(b.customer.nameEn));

  return {
    startDate,
    endDate,
    filters: { ...filters, customerGroup: groupFilter.kind === "group" ? groupFilter.group : null, customerGroupKind: groupFilter.kind, customer },
    rows,
    totals: customerTotals(rows),
  };
}

export async function consumerBehaviourReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await consumerBehaviourReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير سلوك العميل" : "Consumer Behaviour Report", { views: [{ rightToLeft: isAr }] });
  const headers = isAr
    ? ["#", "العميل", "الموبايل", "المنطقة", "موقع العمل", "المعاملات", "الوحدات", "متوسط السله", "المبيعات", "أفضل وقت للتسوق", "نوع الشراء", "الخدمة المفضلة"]
    : ["SR.No", "Customer", "Mobile", "Region", "Store", "Transactions", "Units", "Basket Size", "Sales", "Best Time", "Deal Type", "Favourite Service"];
  const width = headers.length;
  const f = report.filters;
  const groupText =
    f.customerGroupKind === "ungrouped" ? (isAr ? "عملاء الفروع" : "Locations Customers") : f.customerGroup ? pickName(f.customerGroup, isAr) : isAr ? "كل العملاء" : "All Customers";
  const extra = [
    `${isAr ? "مجموعة العملاء" : "Customer Group"}: ${groupText}`,
    f.customer ? `${isAr ? "العميل" : "Customer"}: ${pickName(f.customer, isAr)} / ${f.customer.phone}` : "",
  ].filter(Boolean);
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(f, isAr, extra)], width, `${report.startDate} ~ ${report.endDate}`);
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  const label = <K extends string>(map: Record<K, { en: string; ar: string }>, k: K | null) => (k ? (isAr ? map[k].ar : map[k].en) : "");
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
      label(SLOT_LABEL, row.bestTime),
      label(DEAL_LABEL, row.dealType),
      row.favouriteService ? pickName(row.favouriteService, isAr) : "",
    ];
    r++;
  });
  const t = report.totals;
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", "", "", "", "", t.transactions, Number(t.units), Number(t.basketSize), Number(t.sales), "", "", ""];
  sheet.getRow(r).font = { bold: true };
  [8, 28, 16, 16, 26, 14, 12, 12, 14, 18, 16, 24].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  [8, 9].forEach((c) => (sheet.getColumn(c).numFmt = "#,##0.00"));
  return { workbook, filename: xlsxFilename("Consumer_Behaviour_Report") };
}
