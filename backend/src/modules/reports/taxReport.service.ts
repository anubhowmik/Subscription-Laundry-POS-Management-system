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
 * Reference's laundry "Tax Report" (ReportController@TaxReport / TaxDetails +
 * report/laundry_tax_report.blade.php): the "Overall" output tax for the period, then one row per
 * taxed invoice - date, invoice no., customer, customer tax number, total amount, payment method
 * (the method's name, or "Payment" when split over several), invoice discount, and one column per
 * tax rate holding that rate's line tax. Filters: Location Group, Business Location, Date Range.
 *
 * Lines here store their tax percentage rather than a tax id, so each rate column collects the
 * lines whose percentage matches it; a taxed line matching no configured rate gets its own
 * "x%" column rather than being dropped. Only FINAL invoices count (the reference keeps every
 * non-quotation sell, drafts included), and footer totals cover every row, not just the page shown.
 */

const zero = () => new Decimal(0);

export async function taxReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  const [taxes, sales] = await Promise.all([
    prisma.tax.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, nameEn: true, nameAr: true, percentage: true } }),
    prisma.sale.findMany({
      where: {
        organizationId,
        status: "FINAL",
        businessLocationId: { in: locations.map((l) => l.id) },
        saleDate: { gte: from, lte: to },
        OR: [{ taxAmount: { gt: 0 } }, { items: { some: { taxAmount: { gt: 0 } } } }],
        ...saleScopeWhere(scope),
      },
      orderBy: { saleDate: "desc" },
      select: {
        id: true,
        saleDate: true,
        invoiceNumber: true,
        discountAmount: true,
        taxAmount: true,
        customer: { select: { nameEn: true, nameAr: true, businessName: true, vatNumber: true } },
        items: { select: { subtotal: true, taxAmount: true, taxPercent: true, discountAmount: true } },
        payments: { where: { type: "SALE_PAYMENT" }, select: { paymentMethod: { select: { id: true, nameEn: true, nameAr: true } } } },
      },
    }),
  ]);

  // Rate columns: every configured tax, plus any taxed percentage no configured tax matches.
  const columns: { key: string; nameEn: string; nameAr: string | null; percentage: string }[] = taxes.map((t) => ({
    key: t.id,
    nameEn: t.nameEn,
    nameAr: t.nameAr,
    percentage: t.percentage.toFixed(2),
  }));
  const columnFor = new Map<string, string>(); // percentage -> column key (first configured tax wins)
  for (const c of [...columns].reverse()) columnFor.set(c.percentage, c.key);
  for (const s of sales)
    for (const i of s.items) {
      const pct = i.taxPercent.toFixed(2);
      if (i.taxAmount.gt(0) && !columnFor.has(pct)) {
        const label = `${i.taxPercent.toDecimalPlaces(2).toString()}%`;
        columns.push({ key: `pct:${pct}`, nameEn: label, nameAr: label, percentage: pct });
        columnFor.set(pct, `pct:${pct}`);
      }
    }

  let overallTax = zero();
  let totalAmount = zero();
  const taxTotals = new Map<string, Decimal>(columns.map((c) => [c.key, zero()]));
  const methodCounts = new Map<string, { nameEn: string; nameAr: string | null; count: number }>();
  const rows = sales.map((s) => {
    overallTax = overallTax.add(s.taxAmount);
    const amount = s.items.reduce((a, i) => a.add(i.subtotal).add(i.taxAmount), zero());
    totalAmount = totalAmount.add(amount);
    const perTax: Record<string, string> = {};
    for (const i of s.items) {
      if (!i.taxAmount.gt(0)) continue;
      const key = columnFor.get(i.taxPercent.toFixed(2))!;
      perTax[key] = new Decimal(perTax[key] ?? 0).add(i.taxAmount).toFixed(2);
      taxTotals.set(key, taxTotals.get(key)!.add(i.taxAmount));
    }
    const methods = [...new Map(s.payments.map((p) => [p.paymentMethod.id, p.paymentMethod])).values()];
    // Reference: the method's name when paid one way, "Payment" (checkout_multi_pay) when split.
    const paymentMethod = methods.length === 1 ? { nameEn: methods[0].nameEn, nameAr: methods[0].nameAr } : methods.length > 1 ? { nameEn: "Payment", nameAr: "الدفع" } : null;
    if (paymentMethod) {
      const k = paymentMethod.nameEn;
      const m = methodCounts.get(k) ?? { ...paymentMethod, count: 0 };
      m.count++;
      methodCounts.set(k, m);
    }
    const lineDiscounts = s.items.reduce((a, i) => a.add(i.discountAmount), zero());
    return {
      id: s.id,
      date: localDateTime(s.saleDate),
      invoiceNumber: s.invoiceNumber,
      customer: s.customer,
      taxNumber: s.customer.vatNumber,
      totalAmount: amount.toFixed(2),
      paymentMethod,
      discount: s.discountAmount.sub(lineDiscounts).toFixed(2),
      taxes: perTax,
    };
  });

  return {
    startDate,
    endDate,
    filters,
    overallTax: overallTax.toFixed(2),
    taxColumns: columns,
    rows,
    totals: {
      totalAmount: totalAmount.toFixed(2),
      taxes: Object.fromEntries([...taxTotals].map(([k, v]) => [k, v.toFixed(2)])),
      paymentMethods: [...methodCounts.values()],
    },
  };
}

export async function taxReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await taxReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const name = (x: { nameEn: string; nameAr: string | null }) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير الضرائب" : "Tax Report", { views: [{ rightToLeft: isAr }] });
  const headers = [
    ...(isAr ? ["التاريخ", "رقم الفاتورة", "العميل", "الرقم الضريبي", "اجمالي المبلغ", "طريقة الدفع", "الخصم"] : ["Date", "Invoice No", "Customer", "Tax number", "Total amount", "Payment Method", "Discount"]),
    ...report.taxColumns.map(name),
  ];
  const width = headers.length;
  let r = writeSheetHeader(
    sheet,
    [await reportHeaderText(organizationId), locationFiltersText(report.filters, isAr), `${isAr ? "إجمالي" : "Overall"}: ${report.overallTax}`],
    width,
    `${report.startDate} ~ ${report.endDate}`,
  );
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  for (const row of report.rows) {
    const c = row.customer;
    sheet.getRow(r).values = [
      row.date,
      row.invoiceNumber ?? "",
      `${c.businessName ? `${c.businessName}, ` : ""}${name(c)}`,
      row.taxNumber ?? "",
      Number(row.totalAmount),
      row.paymentMethod ? name(row.paymentMethod) : "",
      Number(row.discount) ? Number(row.discount) : "",
      ...report.taxColumns.map((t) => (row.taxes[t.key] ? Number(row.taxes[t.key]) : "")),
    ];
    r++;
  }
  sheet.getRow(r).values = [
    isAr ? "المجموع" : "Total",
    "",
    "",
    "",
    Number(report.totals.totalAmount),
    report.totals.paymentMethods.map((m) => `${name(m)} - ${m.count}`).join(", "),
    "",
    ...report.taxColumns.map((t) => Number(report.totals.taxes[t.key])),
  ];
  sheet.getRow(r).font = { bold: true };
  [18, 16, 26, 18, 14, 18, 12].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  for (let c = 8; c <= width; c++) sheet.getColumn(c).width = 14;
  for (const c of [5, 7, ...report.taxColumns.map((_, i) => 8 + i)]) sheet.getColumn(c).numFmt = "#,##0.00";
  return { workbook, filename: xlsxFilename("Tax_Report") };
}
