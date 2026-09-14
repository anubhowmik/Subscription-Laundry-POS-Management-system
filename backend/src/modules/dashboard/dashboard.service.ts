import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

const { Decimal } = Prisma;

const RIYADH_OFFSET_HOURS = 3; // Asia/Riyadh has no DST

function riyadhDayBounds(daysAgo = 0) {
  const now = new Date();
  const riyadhNow = new Date(now.getTime() + RIYADH_OFFSET_HOURS * 60 * 60 * 1000);
  riyadhNow.setUTCDate(riyadhNow.getUTCDate() - daysAgo);
  const start = new Date(Date.UTC(riyadhNow.getUTCFullYear(), riyadhNow.getUTCMonth(), riyadhNow.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    start: new Date(start.getTime() - RIYADH_OFFSET_HOURS * 60 * 60 * 1000),
    end: new Date(end.getTime() - RIYADH_OFFSET_HOURS * 60 * 60 * 1000),
  };
}

/** Sum of each product line's Product.purchasePrice x quantity across a set of FINAL sales -
 * the only real per-unit cost this schema tracks (service lines have no cost concept, matching
 * how a laundry's actual cost of running a wash cycle isn't itemized per garment anywhere else
 * in this app either - see the Total Profit KPI's own comment below for how this is used). */
async function costOfGoodsSold(where: Prisma.SaleWhereInput) {
  const productLines = await prisma.saleItem.findMany({
    where: { sale: where, productId: { not: null } },
    select: { quantity: true, product: { select: { purchasePrice: true } } },
  });
  return productLines.reduce((sum, l) => sum.add((l.product?.purchasePrice ?? new Decimal(0)).mul(l.quantity)), new Decimal(0));
}

export async function getSummary(organizationId: string, allowedLocationIds: string[] | null) {
  const locationFilter = {
    organizationId,
    ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}),
  };
  const finalSaleWhere: Prisma.SaleWhereInput = { ...locationFilter, status: "FINAL" };
  const { start: todayStart, end: todayEnd } = riyadhDayBounds(0);
  const { start: yesterdayStart, end: yesterdayEnd } = riyadhDayBounds(1);

  const [
    todaySales,
    yesterdaySales,
    todayOrderCount,
    yesterdayOrderCount,
    totalCustomers,
    yesterdayCustomerCount,
    lowStockProducts,
    recentSales,
    recentPayments,
    recentProducts,
    lifetimeRevenue,
    lifetimeOrderCount,
    outstandingDue,
    expenseTotal,
    paymentRows,
    topProductLines,
    topServiceLines,
  ] = await Promise.all([
    prisma.sale.aggregate({ where: { ...finalSaleWhere, saleDate: { gte: todayStart, lt: todayEnd } }, _sum: { totalAmount: true } }),
    prisma.sale.aggregate({ where: { ...finalSaleWhere, saleDate: { gte: yesterdayStart, lt: yesterdayEnd } }, _sum: { totalAmount: true } }),
    prisma.sale.count({ where: { ...finalSaleWhere, saleDate: { gte: todayStart, lt: todayEnd } } }),
    prisma.sale.count({ where: { ...finalSaleWhere, saleDate: { gte: yesterdayStart, lt: yesterdayEnd } } }),
    prisma.customer.count({ where: { organizationId, deletedAt: null, status: "ACTIVE" } }),
    prisma.customer.count({ where: { organizationId, deletedAt: null, status: "ACTIVE", createdAt: { lt: todayStart } } }),
    prisma.productStock.findMany({
      where: {
        ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}),
        product: { organizationId, manageStock: true, alertQuantity: { not: null } },
      },
      include: { product: { select: { nameEn: true, nameAr: true, alertQuantity: true } } },
    }),
    prisma.sale.findMany({
      where: finalSaleWhere,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, invoiceNumber: true, totalAmount: true, paymentStatus: true, createdAt: true, customer: { select: { nameEn: true, nameAr: true } } },
    }),
    prisma.payment.findMany({
      where: { type: "SALE_PAYMENT", businessLocation: locationFilter },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, amount: true, createdAt: true, customer: { select: { nameEn: true, nameAr: true } } },
    }),
    prisma.product.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, nameEn: true, nameAr: true, createdAt: true },
    }),
    prisma.sale.aggregate({ where: finalSaleWhere, _sum: { totalAmount: true, subtotal: true } }),
    prisma.sale.count({ where: finalSaleWhere }),
    prisma.sale.aggregate({ where: { ...finalSaleWhere, dueAmount: { gt: 0 } }, _sum: { dueAmount: true } }),
    prisma.expense.aggregate({ where: { organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) }, _sum: { totalAmount: true } }),
    // Payment Method breakdown ("circle report") - last 30 days, matching salesReport's own
    // default window (reports.service.ts's resolveRange) rather than an all-time total that would
    // just calcify into one unchanging pie forever.
    prisma.payment.groupBy({
      by: ["paymentMethodId"],
      where: { type: "SALE_PAYMENT", paymentDate: { gte: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000) }, businessLocation: locationFilter },
      _sum: { amount: true },
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { productId: { not: null }, sale: { ...finalSaleWhere, saleDate: { gte: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000) } } },
      _sum: { quantity: true, total: true },
    }),
    prisma.saleItem.groupBy({
      by: ["serviceId"],
      where: { serviceId: { not: null }, sale: { ...finalSaleWhere, saleDate: { gte: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000) } } },
      _sum: { quantity: true, total: true },
    }),
  ]);

  const lowStock = lowStockProducts.filter((s) => s.product.alertQuantity !== null && s.quantity.lte(s.product.alertQuantity));

  // One real per-day series per KPI card, not one series reused everywhere - a fabricated trend
  // (e.g. showing the sales squiggle under "Total Customers") would violate StatCard's own
  // documented "never fabricate a trend" rule. Outstanding Due gets no sparkline at all below:
  // it's a point-in-time AR snapshot with no historical series to draw from (no audit table of
  // past due-amounts), so it stays honest by simply not pretending to have one.
  const salesByDay = await Promise.all(
    Array.from({ length: 7 }, (_, i) => 6 - i).map(async (daysAgo) => {
      const { start, end } = riyadhDayBounds(daysAgo);
      const [result, cogsForDay, newCustomers] = await Promise.all([
        prisma.sale.aggregate({ where: { ...finalSaleWhere, saleDate: { gte: start, lt: end } }, _sum: { totalAmount: true, subtotal: true }, _count: true }),
        costOfGoodsSold({ ...finalSaleWhere, saleDate: { gte: start, lt: end } }),
        prisma.customer.count({ where: { organizationId, deletedAt: null, createdAt: { gte: start, lt: end } } }),
      ]);
      return {
        date: start.toISOString().slice(0, 10),
        total: result._sum.totalAmount ?? 0,
        count: result._count,
        profit: (result._sum.subtotal ?? new Decimal(0)).sub(cogsForDay),
        newCustomers,
      };
    }),
  );

  const cogs = await costOfGoodsSold(finalSaleWhere);
  // Total Profit = net revenue (subtotal, excl. VAT - tax collected isn't real income) minus cost
  // of goods sold minus recorded operating expenses, all lifetime. See costOfGoodsSold()'s own
  // comment on why service lines contribute 0 cost - this is necessarily an approximation for a
  // service-heavy laundry business, not a full costed P&L.
  const netRevenue = lifetimeRevenue._sum.subtotal ?? new Decimal(0);
  const totalProfit = netRevenue.sub(cogs).sub(expenseTotal._sum.totalAmount ?? new Decimal(0));

  const paymentMethods = await prisma.paymentMethod.findMany({
    where: { id: { in: paymentRows.map((r) => r.paymentMethodId) } },
    select: { id: true, nameEn: true, nameAr: true, code: true },
  });
  const paymentMethodBreakdown = paymentRows
    .map((r) => {
      const method = paymentMethods.find((m) => m.id === r.paymentMethodId);
      return { paymentMethodId: r.paymentMethodId, nameEn: method?.nameEn ?? "Unknown", nameAr: method?.nameAr ?? "Unknown", code: method?.code ?? "OTHER", total: r._sum.amount ?? new Decimal(0) };
    })
    .sort((a, b) => b.total.cmp(a.total));

  // Top Selling Items - product and service lines merged into one ranked list (this is
  // predominantly a laundry SERVICE business - a product-only ranking would be empty or
  // meaningless for most orgs using this app).
  const productIds = topProductLines.map((r) => r.productId!).filter(Boolean);
  const serviceIds = topServiceLines.map((r) => r.serviceId!).filter(Boolean);
  const [products, services] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, nameEn: true, nameAr: true } }),
  ]);
  const topItems = [
    ...topProductLines.map((r) => {
      const p = products.find((x) => x.id === r.productId);
      return { id: r.productId!, kind: "PRODUCT" as const, nameEn: p?.nameEn ?? "Unknown", nameAr: p?.nameAr ?? "Unknown", quantity: r._sum.quantity ?? new Decimal(0), revenue: r._sum.total ?? new Decimal(0) };
    }),
    ...topServiceLines.map((r) => {
      const s = services.find((x) => x.id === r.serviceId);
      return { id: r.serviceId!, kind: "SERVICE" as const, nameEn: s?.nameEn ?? "Unknown", nameAr: s?.nameAr ?? "Unknown", quantity: r._sum.quantity ?? new Decimal(0), revenue: r._sum.total ?? new Decimal(0) };
    }),
  ]
    .sort((a, b) => b.revenue.cmp(a.revenue))
    .slice(0, 5);

  // Recent Activities - a merged, time-sorted feed across sale creation / payments received /
  // low-stock crossings / new catalog items, matching the reference's own multi-source activity
  // list rather than just "recent sales" (this app's previous Dashboard only showed the latter).
  type Activity = { id: string; kind: "SALE" | "PAYMENT" | "LOW_STOCK" | "PRODUCT"; at: Date; titleEn: string; titleAr: string; subtitleEn: string; subtitleAr: string };
  const activities: Activity[] = [
    ...recentSales.map((s) => ({
      id: `sale-${s.id}`,
      kind: "SALE" as const,
      at: s.createdAt,
      titleEn: "New sale invoice created",
      titleAr: "تم إنشاء فاتورة بيع جديدة",
      subtitleEn: `Invoice ${s.invoiceNumber ?? ""} - ${s.customer.nameEn}`,
      subtitleAr: `فاتورة ${s.invoiceNumber ?? ""} - ${s.customer.nameAr || s.customer.nameEn}`,
    })),
    ...recentPayments.map((p) => ({
      id: `payment-${p.id}`,
      kind: "PAYMENT" as const,
      at: p.createdAt,
      titleEn: "Payment received",
      titleAr: "تم استلام دفعة",
      subtitleEn: `From ${p.customer.nameEn}`,
      subtitleAr: `من ${p.customer.nameAr || p.customer.nameEn}`,
    })),
    ...lowStock.slice(0, 5).map((s) => ({
      id: `lowstock-${s.id}`,
      kind: "LOW_STOCK" as const,
      at: new Date(),
      titleEn: "Low stock warning",
      titleAr: "تنبيه انخفاض المخزون",
      subtitleEn: `Product "${s.product.nameEn}" is low`,
      subtitleAr: `المنتج "${s.product.nameAr || s.product.nameEn}" منخفض`,
    })),
    ...recentProducts.map((p) => ({
      id: `product-${p.id}`,
      kind: "PRODUCT" as const,
      at: p.createdAt,
      titleEn: "New product added",
      titleAr: "تمت إضافة منتج جديد",
      subtitleEn: `"${p.nameEn}" added`,
      subtitleAr: `تمت إضافة "${p.nameAr || p.nameEn}"`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  return {
    todaySalesTotal: todaySales._sum.totalAmount ?? 0,
    yesterdaySalesTotal: yesterdaySales._sum.totalAmount ?? 0,
    todayOrderCount,
    yesterdayOrderCount,
    totalCustomers,
    yesterdayCustomerCount,
    lowStockCount: lowStock.length,
    lowStockProducts: lowStock.slice(0, 10),
    recentSales,
    salesByDay,
    totalRevenue: lifetimeRevenue._sum.totalAmount ?? 0,
    totalOrders: lifetimeOrderCount,
    totalProfit,
    outstandingDue: outstandingDue._sum.dueAmount ?? 0,
    paymentMethodBreakdown,
    topItems,
    activities,
  };
}

const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

/**
 * Sales Overview chart data - Sales/Orders/Profit series over a selectable period ("every sorting
 * option": 7 days / 30 days / 90 days / this month / this year), each bucketed by calendar day
 * (or by month for the "this year" span, since 365 daily bars would be unreadable).
 */
export async function getSalesOverview(period: string, organizationId: string, allowedLocationIds: string[] | null) {
  const locationFilter = { organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) };
  const finalSaleWhere: Prisma.SaleWhereInput = { ...locationFilter, status: "FINAL" };

  if (period === "thisYear") {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => i);
    const buckets = await Promise.all(
      months.map(async (m) => {
        const start = new Date(Date.UTC(now.getUTCFullYear(), m, 1));
        const end = new Date(Date.UTC(now.getUTCFullYear(), m + 1, 1));
        const [agg, cogs] = await Promise.all([
          prisma.sale.aggregate({ where: { ...finalSaleWhere, saleDate: { gte: start, lt: end } }, _sum: { totalAmount: true, subtotal: true }, _count: true }),
          costOfGoodsSold({ ...finalSaleWhere, saleDate: { gte: start, lt: end } }),
        ]);
        const profit = (agg._sum.subtotal ?? new Decimal(0)).sub(cogs);
        return { date: start.toISOString().slice(0, 7), sales: agg._sum.totalAmount ?? new Decimal(0), orders: agg._count, profit };
      }),
    );
    return { period, buckets };
  }

  const days = PERIOD_DAYS[period] ?? 7;
  const buckets = await Promise.all(
    Array.from({ length: days }, (_, i) => days - 1 - i).map(async (daysAgo) => {
      const { start, end } = riyadhDayBounds(daysAgo);
      const [agg, cogs] = await Promise.all([
        prisma.sale.aggregate({ where: { ...finalSaleWhere, saleDate: { gte: start, lt: end } }, _sum: { totalAmount: true, subtotal: true }, _count: true }),
        costOfGoodsSold({ ...finalSaleWhere, saleDate: { gte: start, lt: end } }),
      ]);
      const profit = (agg._sum.subtotal ?? new Decimal(0)).sub(cogs);
      return { date: start.toISOString().slice(0, 10), sales: agg._sum.totalAmount ?? new Decimal(0), orders: agg._count, profit };
    }),
  );
  return { period, buckets };
}
