import { prisma } from "../../config/prisma";

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

export async function getSummary(organizationId: string, allowedLocationIds: string[] | null) {
  const locationFilter = {
    organizationId,
    ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}),
  };
  const { start: todayStart, end: todayEnd } = riyadhDayBounds(0);

  const [todaySales, todayOrderCount, totalCustomers, lowStockProducts, recentSales] = await Promise.all([
    prisma.sale.aggregate({
      where: { ...locationFilter, saleDate: { gte: todayStart, lt: todayEnd }, status: "FINAL" },
      _sum: { totalAmount: true },
    }),
    prisma.sale.count({
      where: { ...locationFilter, saleDate: { gte: todayStart, lt: todayEnd }, status: "FINAL" },
    }),
    prisma.customer.count({ where: { organizationId, deletedAt: null, status: "ACTIVE" } }),
    prisma.productStock.findMany({
      where: {
        ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}),
        product: { organizationId, manageStock: true, alertQuantity: { not: null } },
      },
      include: { product: { select: { nameEn: true, nameAr: true, alertQuantity: true } } },
    }),
    prisma.sale.findMany({
      where: { ...locationFilter, status: "FINAL" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { customer: { select: { nameEn: true, nameAr: true } } },
    }),
  ]);

  const lowStock = lowStockProducts.filter(
    (s) => s.product.alertQuantity !== null && s.quantity.lte(s.product.alertQuantity),
  );

  const salesByDay = await Promise.all(
    Array.from({ length: 7 }, (_, i) => 6 - i).map(async (daysAgo) => {
      const { start, end } = riyadhDayBounds(daysAgo);
      const result = await prisma.sale.aggregate({
        where: { ...locationFilter, saleDate: { gte: start, lt: end }, status: "FINAL" },
        _sum: { totalAmount: true },
        _count: true,
      });
      return { date: start.toISOString().slice(0, 10), total: result._sum.totalAmount ?? 0, count: result._count };
    }),
  );

  return {
    todaySalesTotal: todaySales._sum.totalAmount ?? 0,
    todayOrderCount,
    totalCustomers,
    lowStockCount: lowStock.length,
    lowStockProducts: lowStock.slice(0, 10),
    recentSales,
    salesByDay,
  };
}
