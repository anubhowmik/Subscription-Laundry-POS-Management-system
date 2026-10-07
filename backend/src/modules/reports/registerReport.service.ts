import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
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
type Decimal = Prisma.Decimal;

/**
 * Reference's "Register Report" (ReportController@getRegisterReport + report/register_report.blade.php):
 * one row per cash register session opened in the period - open time, close time (closed ones only),
 * branch, user, the amount taken through each payment method (card / cheque with their counts),
 * and the total. Filters: Location Group, Business Location, User, Status (open/close), Date Range
 * (on the open time, as the reference's `cash_registers.created_at`).
 *
 * The reference sums `cash_register_transactions` of type 'sell' per pay method. Here every sale
 * records the session it was rung up under, so a session's takings are the payments on its sales
 * made while it was open (later "pay due" payments on another day aren't credited to an old
 * session). Payment methods are this business's own list rather than the reference's fixed
 * cash/card/cheque/bank/advance/custom_pay_1..7 set. Unlike the reference (whose permitted-location
 * check is commented out) a user only ever sees their own branches' registers.
 */

const zero = () => new Decimal(0);

/** Reference's fixed register columns come first, under its own headings; this business's other methods follow by name. */
const METHOD_ORDER = ["CARD", "CHEQUE", "CASH", "BANK_TRANSFER"];
const METHOD_LABELS: Record<string, { nameEn: string; nameAr: string }> = {
  CARD: { nameEn: "Total Card Slips", nameAr: "العدد الإجمالي للبطاقات" },
  CHEQUE: { nameEn: "Total cheques", nameAr: "إجمالي الشيكات" },
  CASH: { nameEn: "Total Cash", nameAr: "مجموع النقد" },
  BANK_TRANSFER: { nameEn: "Total bank transfer", nameAr: "إجمالي التحويل المصرفي" },
};

export async function registerReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const userId = query.userId ? String(query.userId) : undefined;
  const status = query.status === "open" ? "OPEN" : query.status === "close" ? "CLOSED" : undefined;
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  const [methods, sessions, user] = await Promise.all([
    prisma.paymentMethod
      .findMany({ where: { organizationId }, select: { id: true, code: true, nameEn: true, nameAr: true } })
      .then((list) =>
        list
          .map((m) => ({ ...m, ...(METHOD_LABELS[m.code] ?? {}) }))
          .sort((a, b) => (METHOD_ORDER.indexOf(a.code) + 1 || 99) - (METHOD_ORDER.indexOf(b.code) + 1 || 99) || a.code.localeCompare(b.code)),
      ),
    prisma.registerSession.findMany({
      where: {
        organizationId,
        businessLocationId: { in: locations.map((l) => l.id) },
        openedAt: { gte: from, lte: to },
        ...(userId ? { openedBy: userId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { openedAt: "desc" },
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        status: true,
        openingCashAmount: true,
        expectedCashAmount: true,
        countedCashAmount: true,
        cashDifference: true,
        notes: true,
        businessLocation: { select: { branchName: true, branchNameAr: true, branchCode: true } },
        openedByUser: { select: { fullNameEn: true, fullNameAr: true, email: true } },
        closedByUser: { select: { fullNameEn: true, fullNameAr: true } },
        sales: {
          where: { status: "FINAL", ...saleScopeWhere(scope) },
          select: { payments: { where: { type: "SALE_PAYMENT" }, select: { amount: true, paymentMethodId: true, paymentDate: true } } },
        },
      },
    }),
    userId ? prisma.user.findFirst({ where: { id: userId, organizationId }, select: { fullNameEn: true, fullNameAr: true } }) : null,
  ]);

  const totals = new Map<string, { amount: Decimal; count: number }>(methods.map((m) => [m.id, { amount: zero(), count: 0 }]));
  let grand = zero();
  const rows = sessions.map((s) => {
    const until = s.closedAt ?? new Date();
    const byMethod = new Map<string, { amount: Decimal; count: number }>(methods.map((m) => [m.id, { amount: zero(), count: 0 }]));
    let salesCount = 0;
    for (const sale of s.sales) {
      const inSession = sale.payments.filter((p) => p.paymentDate >= s.openedAt && p.paymentDate <= until);
      if (inSession.length) salesCount++;
      for (const p of inSession) {
        const m = byMethod.get(p.paymentMethodId);
        if (!m) continue;
        m.amount = m.amount.add(p.amount);
        m.count++;
      }
    }
    let total = zero();
    for (const [id, m] of byMethod) {
      total = total.add(m.amount);
      const t = totals.get(id)!;
      t.amount = t.amount.add(m.amount);
      t.count += m.count;
    }
    grand = grand.add(total);
    return {
      id: s.id,
      openTime: localDateTime(s.openedAt),
      closeTime: s.status === "CLOSED" && s.closedAt ? localDateTime(s.closedAt) : null,
      status: s.status,
      location: s.businessLocation,
      user: s.openedByUser,
      closedBy: s.closedByUser,
      methods: Object.fromEntries([...byMethod].map(([id, m]) => [id, { amount: m.amount.toFixed(2), count: m.count }])),
      total: total.toFixed(2),
      salesCount,
      openingCash: s.openingCashAmount.toFixed(2),
      expectedCash: s.expectedCashAmount?.toFixed(2) ?? null,
      countedCash: s.countedCashAmount?.toFixed(2) ?? null,
      cashDifference: s.cashDifference?.toFixed(2) ?? null,
      notes: s.notes,
    };
  });

  return {
    startDate,
    endDate,
    filters: { ...filters, user, status: status ?? null },
    paymentMethods: methods,
    rows,
    totals: { methods: Object.fromEntries([...totals].map(([id, m]) => [id, { amount: m.amount.toFixed(2), count: m.count }])), total: grand.toFixed(2) },
  };
}

/** Card and cheque columns show their slip/cheque count, as the reference's "Total card slips" / "Total cheques". */
const COUNTED = new Set(["CARD", "CHEQUE"]);

export async function registerReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await registerReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const name = (x: { nameEn: string; nameAr: string | null }) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير المناوبة" : "Register Report", { views: [{ rightToLeft: isAr }] });
  const headers = [
    ...(isAr ? ["وقت البداية", "وقت الانتهاء", "الفرع", "المستخدم"] : ["Open Time", "Close Time", "Location", "User"]),
    ...report.paymentMethods.map(name),
    isAr ? "المجموع" : "Total",
  ];
  const width = headers.length;
  const extra = [
    report.filters.user ? `${isAr ? "المستخدم" : "User"}: ${isAr ? report.filters.user.fullNameAr || report.filters.user.fullNameEn : report.filters.user.fullNameEn}` : "",
    report.filters.status ? `${isAr ? "الحالة" : "Status"}: ${report.filters.status === "OPEN" ? (isAr ? "مفتوح" : "Open") : isAr ? "مغلق" : "Close"}` : "",
  ].filter(Boolean);
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(report.filters, isAr, extra)], width, `${report.startDate} ~ ${report.endDate}`);
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  const cell = (code: string, m: { amount: string; count: number }) => (COUNTED.has(code) ? `${Number(m.amount).toFixed(2)} (${m.count})` : Number(m.amount));
  for (const row of report.rows) {
    sheet.getRow(r).values = [
      row.openTime,
      row.closeTime ?? "",
      `${isAr ? row.location.branchNameAr || row.location.branchName : row.location.branchName} (${row.location.branchCode})`,
      `${isAr ? row.user.fullNameAr || row.user.fullNameEn : row.user.fullNameEn}${row.user.email ? ` - ${row.user.email}` : ""}`,
      ...report.paymentMethods.map((m) => cell(m.code, row.methods[m.id])),
      Number(row.total),
    ];
    r++;
  }
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", "", "", "", ...report.paymentMethods.map((m) => cell(m.code, report.totals.methods[m.id])), Number(report.totals.total)];
  sheet.getRow(r).font = { bold: true };
  [18, 18, 26, 30].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  for (let c = 5; c <= width; c++) {
    sheet.getColumn(c).width = 16;
    sheet.getColumn(c).numFmt = "#,##0.00";
  }
  return { workbook, filename: xlsxFilename("Register_Report") };
}
