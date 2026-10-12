import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";
import { parsePagination } from "../../utils/pagination";
import { resolveBusinessLocationFilter } from "../../utils/locationScope";
import { syncDocumentAccountTransaction, syncPaymentAccountTransaction } from "./paymentAccountLink";
import {
  TXN_INCLUDE,
  TXN_ORDER,
  assertInScope,
  assertPaymentAccountUsable,
  balancesByAccount,
  describe,
  intersect,
  locationAccountIds,
  movementScopeWhere,
  scopedAccountIds,
  signed,
} from "./paymentAccount.service";
import { parseAppScope, saleScopeWhere, type ReportAppScope } from "../reports/reportCommon";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

function endOfDay(date: unknown): Date {
  return date ? new Date(`${String(date)}T23:59:59.999`) : new Date();
}

async function reportAccountScope(allowedLocationIds: string[] | null, businessLocationId: unknown) {
  const scope = await scopedAccountIds(allowedLocationIds);
  if (!businessLocationId) return scope;
  // Reference only narrows by location when that branch actually has default payment accounts set.
  const locationIds = await locationAccountIds(String(businessLocationId));
  return locationIds.length > 0 ? intersect(scope, locationIds) : scope;
}

// ---------------------------------------------------------------------------
// Cash Flow (AccountController@cashFlow)
// ---------------------------------------------------------------------------

export async function cashFlow(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query, 500);
  let scope = await reportAccountScope(allowedLocationIds, query.businessLocationId);
  if (query.accountId) scope = intersect(scope, [String(query.accountId)]);

  const where: Prisma.PaymentAccountTransactionWhereInput = {
    paymentAccount: { organizationId },
    ...(scope ? { paymentAccountId: { in: scope } } : {}),
    ...movementScopeWhere(parseAppScope(query)),
  };
  const all = await prisma.paymentAccountTransaction.findMany({ where, orderBy: TXN_ORDER, include: TXN_INCLUDE });

  const from = query.from ? new Date(`${String(query.from)}T00:00:00`) : null;
  const to = query.to ? endOfDay(query.to) : null;
  const perAccount = new Map<string, Decimal>();
  let total = new Decimal(0);
  const rows = [];
  for (const t of all) {
    // Account Balance = that account's running balance; Total Balance = running balance across every
    // account in scope, of the selected debit/credit type when one is chosen (reference's total_balance).
    perAccount.set(t.paymentAccountId, (perAccount.get(t.paymentAccountId) ?? new Decimal(0)).add(signed(t)));
    if (!query.type || t.type === query.type) total = total.add(signed(t));

    if (from && t.operationDate < from) continue;
    if (to && t.operationDate > to) continue;
    if (query.type && t.type !== query.type) continue;
    rows.push({
      id: t.id,
      operationDate: t.operationDate,
      accountName: t.paymentAccount.name,
      type: t.type,
      amount: t.amount,
      note: t.note,
      description: describe(t),
      accountBalance: perAccount.get(t.paymentAccountId)!.toDecimalPlaces(2),
      totalBalance: total.toDecimalPlaces(2),
    });
  }

  const totals = rows.reduce(
    (acc, r) => (r.type === "DEBIT" ? { ...acc, debit: acc.debit.add(r.amount) } : { ...acc, credit: acc.credit.add(r.amount) }),
    { debit: new Decimal(0), credit: new Decimal(0) },
  );
  return { data: rows.slice(skip, skip + limit), meta: { page, limit, total: rows.length }, totals };
}

// ---------------------------------------------------------------------------
// Balance Sheet / Trial Balance (AccountReportsController) - built the reference's way from
// supplier due, customer due, closing stock and account balances, not from a double-entry ledger.
// ---------------------------------------------------------------------------

// App scope: Customer Due counts that app's invoices (and their returns); Supplier Due and Closing
// Stock are purchases and products - Product POS only, zero in Service POS.

async function supplierDue(organizationId: string, end: Date, locationFilter: Prisma.PurchaseWhereInput, app: ReportAppScope) {
  if (app === "service") return new Decimal(0);
  const agg = await prisma.purchase.aggregate({
    where: { organizationId, status: "RECEIVED", purchaseDate: { lte: end }, ...locationFilter },
    _sum: { totalAmount: true, paidAmount: true },
  });
  return (agg._sum.totalAmount ?? new Decimal(0)).sub(agg._sum.paidAmount ?? new Decimal(0));
}

async function invoiceDue(organizationId: string, end: Date, locationFilter: Prisma.SaleWhereInput, app: ReportAppScope) {
  const agg = await prisma.sale.aggregate({
    where: { organizationId, status: "FINAL", saleDate: { lte: end }, ...locationFilter, ...saleScopeWhere(app) },
    _sum: { dueAmount: true },
  });
  return agg._sum.dueAmount ?? new Decimal(0);
}

/** What the business still owes customers on returns (return total minus what was already refunded).
 * The reference subtracts the full return total, which double-counts any return that was refunded
 * on the spot - a fully refunded return of a fully paid sale would wrongly lower Customer Due. */
async function unrefundedSellReturns(organizationId: string, end: Date, locationFilter: Prisma.SellReturnWhereInput, app: ReportAppScope) {
  const agg = await prisma.sellReturn.aggregate({
    where: { organizationId, returnDate: { lte: end }, ...locationFilter, ...(app ? { sale: saleScopeWhere(app) } : {}) },
    _sum: { totalAmount: true, refundedAmount: true },
  });
  return (agg._sum.totalAmount ?? new Decimal(0)).sub(agg._sum.refundedAmount ?? new Decimal(0));
}

/** Reference's getOpeningClosingStock - stock on hand as of the date, valued at purchase price. */
async function closingStock(organizationId: string, end: Date, locationFilter: Prisma.InventoryTransactionWhereInput, app: ReportAppScope) {
  if (app === "service") return new Decimal(0);
  const latest = await prisma.inventoryTransaction.findMany({
    where: { product: { organizationId }, createdAt: { lte: end }, ...locationFilter },
    orderBy: { createdAt: "desc" },
    distinct: ["productId", "businessLocationId"],
    select: { balanceAfter: true, product: { select: { purchasePrice: true } } },
  });
  return latest.reduce((sum, r) => sum.add(r.balanceAfter.mul(r.product.purchasePrice)), new Decimal(0)).toDecimalPlaces(2);
}

async function accountBalancesAsOf(organizationId: string, end: Date, scope: string[] | null, app: ReportAppScope) {
  const balances = await balancesByAccount({
    paymentAccount: { organizationId },
    operationDate: { lte: end },
    ...(scope ? { paymentAccountId: { in: scope } } : {}),
    ...movementScopeWhere(app),
  });
  const accounts = await prisma.paymentAccount.findMany({ where: { id: { in: [...balances.keys()] } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return accounts.map((a) => ({ id: a.id, name: a.name, balance: balances.get(a.id)!.toDecimalPlaces(2) }));
}

function locationFilters(allowedLocationIds: string[] | null, businessLocationId: unknown) {
  const filter = resolveBusinessLocationFilter(businessLocationId ? String(businessLocationId) : undefined, allowedLocationIds);
  return filter as { businessLocationId?: string | { in: string[] } };
}

export async function balanceSheet(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const end = endOfDay(query.endDate);
  const loc = locationFilters(allowedLocationIds, query.businessLocationId);
  const scope = await reportAccountScope(allowedLocationIds, query.businessLocationId);
  const app = parseAppScope(query);
  const [supplier, invoice, returns, stock, accountBalances] = await Promise.all([
    supplierDue(organizationId, end, loc, app),
    invoiceDue(organizationId, end, loc, app),
    unrefundedSellReturns(organizationId, end, loc, app),
    closingStock(organizationId, end, loc, app),
    accountBalancesAsOf(organizationId, end, scope, app),
  ]);
  const customerDue = invoice.sub(returns).toDecimalPlaces(2);
  const totalAssets = accountBalances.reduce((s, a) => s.add(a.balance), customerDue.add(stock)).toDecimalPlaces(2);
  return {
    endDate: end,
    supplierDue: supplier.toDecimalPlaces(2),
    customerDue,
    closingStock: stock,
    accountBalances,
    totalLiability: supplier.toDecimalPlaces(2),
    totalAssets,
  };
}

export async function trialBalance(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const end = endOfDay(query.endDate);
  const loc = locationFilters(allowedLocationIds, query.businessLocationId);
  const scope = await reportAccountScope(allowedLocationIds, query.businessLocationId);
  const app = parseAppScope(query);
  const [supplier, customer, accountBalances] = await Promise.all([
    supplierDue(organizationId, end, loc, app),
    invoiceDue(organizationId, end, loc, app),
    accountBalancesAsOf(organizationId, end, scope, app),
  ]);
  // Reference layout: customer due + account balances in the Debit column, supplier due in Credit.
  const totalDebit = accountBalances.reduce((s, a) => s.add(a.balance), customer).toDecimalPlaces(2);
  return {
    endDate: end,
    supplierDue: supplier.toDecimalPlaces(2),
    customerDue: customer.toDecimalPlaces(2),
    accountBalances,
    totalDebit,
    totalCredit: supplier.toDecimalPlaces(2),
  };
}

// ---------------------------------------------------------------------------
// Payment Account Report + Link Account (AccountReportsController@paymentAccountReport)
// ---------------------------------------------------------------------------

export type LinkSource = "SALE" | "PURCHASE" | "EXPENSE";

/**
 * Reference: every transaction_payment that belongs to a transaction - sales, sell returns,
 * purchases and expenses - except the "advance" method (paid from the customer's advance balance,
 * our Store Credit), which never lands in a payment account. Purchases and expenses carry their
 * single payment on the document itself (paidAmount + paymentAccountId), so they're listed from
 * there. Amount is the payment's own amount; the reference printed the invoice total instead.
 */
export const NOT_ADVANCE: Prisma.PaymentWhereInput = { paymentMethod: { code: { not: "STORE_CREDIT" } } };

export async function paymentAccountReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const account = query.accountId === "none" ? { paymentAccountId: null } : query.accountId ? { paymentAccountId: String(query.accountId) } : {};
  const location = allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {};
  const from = query.from ? new Date(`${String(query.from)}T00:00:00`) : null;
  const to = query.to ? endOfDay(query.to) : null;
  const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  const search = query.search ? String(query.search) : null;
  const contains = (v: string) => ({ contains: v, mode: "insensitive" as const });
  const accountSearch = search ? [{ paymentAccount: { name: contains(search) } }, { paymentAccount: { accountNumber: contains(search) } }] : [];
  const accountSelect = { select: { name: true, accountNumber: true } };
  // App scope: sale payments by their invoice's app, purchases in Product POS only, expenses in every app.
  const app = parseAppScope(query);

  const [payments, purchases, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: {
        businessLocation: { organizationId },
        saleId: { not: null },
        ...NOT_ADVANCE,
        ...(app ? { sale: saleScopeWhere(app) } : {}),
        ...location,
        ...account,
        ...(range ? { paymentDate: range } : {}),
        ...(search ? { OR: [{ paymentRefNo: contains(search) }, { sale: { invoiceNumber: contains(search) } }, ...accountSearch] } : {}),
      },
      select: { id: true, paymentDate: true, paymentRefNo: true, amount: true, type: true, paymentAccountId: true, sale: { select: { id: true, invoiceNumber: true } }, paymentAccount: accountSelect },
    }),
    prisma.purchase.findMany({
      where: {
        organizationId,
        ...(app === "service" ? { id: { in: [] } } : {}),
        status: "RECEIVED",
        paidAmount: { gt: 0 },
        ...location,
        ...account,
        ...(range ? { purchaseDate: range } : {}),
        ...(search ? { OR: [{ referenceNumber: contains(search) }, ...accountSearch] } : {}),
      },
      select: { id: true, purchaseDate: true, referenceNumber: true, paidAmount: true, paymentAccountId: true, paymentAccount: accountSelect },
    }),
    prisma.expense.findMany({
      where: {
        organizationId,
        paidAmount: { gt: 0 },
        ...location,
        ...account,
        ...(range ? { expenseDate: range } : {}),
        ...(search ? { OR: [{ expenseNumber: contains(search) }, ...accountSearch] } : {}),
      },
      select: { id: true, expenseDate: true, expenseNumber: true, paidAmount: true, paymentAccountId: true, paymentAccount: accountSelect },
    }),
  ]);

  const rows = [
    ...payments.map((p) => ({
      id: p.id,
      source: "SALE" as LinkSource,
      paymentDate: p.paymentDate,
      paymentRefNo: p.paymentRefNo,
      amount: p.amount,
      type: p.type === "REFUND" ? ("SELL_RETURN" as const) : ("SALE" as const),
      document: p.sale ? { id: p.sale.id, number: p.sale.invoiceNumber } : null,
      paymentAccountId: p.paymentAccountId,
      paymentAccount: p.paymentAccount,
    })),
    ...purchases.map((p) => ({
      id: p.id,
      source: "PURCHASE" as LinkSource,
      paymentDate: p.purchaseDate,
      paymentRefNo: null,
      amount: p.paidAmount,
      type: "PURCHASE" as const,
      document: { id: p.id, number: p.referenceNumber },
      paymentAccountId: p.paymentAccountId,
      paymentAccount: p.paymentAccount,
    })),
    ...expenses.map((e) => ({
      id: e.id,
      source: "EXPENSE" as LinkSource,
      paymentDate: e.expenseDate,
      paymentRefNo: null,
      amount: e.paidAmount,
      type: "EXPENSE" as const,
      document: { id: e.id, number: e.expenseNumber },
      paymentAccountId: e.paymentAccountId,
      paymentAccount: e.paymentAccount,
    })),
  ].sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime() || a.id.localeCompare(b.id));

  return { data: rows.slice(skip, skip + limit), meta: { page, limit, total: rows.length } };
}

export async function linkAccount(
  id: string,
  paymentAccountId: string,
  source: LinkSource,
  organizationId: string,
  allowedLocationIds: string[] | null,
) {
  const location = allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {};
  await assertPaymentAccountUsable(paymentAccountId, organizationId);
  await assertInScope(paymentAccountId, allowedLocationIds);

  if (source === "PURCHASE" || source === "EXPENSE") {
    const doc =
      source === "PURCHASE"
        ? await prisma.purchase.findFirst({ where: { id, organizationId, ...location }, select: { id: true, paidAmount: true, purchaseDate: true, createdBy: true } })
        : await prisma.expense.findFirst({ where: { id, organizationId, ...location }, select: { id: true, paidAmount: true, expenseDate: true, createdBy: true } });
    if (!doc) throw new NotFoundError("Payment not found");
    const date = "purchaseDate" in doc ? doc.purchaseDate : doc.expenseDate;
    return prisma.$transaction(async (tx) => {
      const updated =
        source === "PURCHASE"
          ? await tx.purchase.update({ where: { id }, data: { paymentAccountId }, select: { id: true, paymentAccountId: true } })
          : await tx.expense.update({ where: { id }, data: { paymentAccountId }, select: { id: true, paymentAccountId: true } });
      await syncDocumentAccountTransaction(tx, source === "PURCHASE" ? "purchase" : "expense", {
        id,
        paymentAccountId,
        paidAmount: doc.paidAmount,
        date,
        createdBy: doc.createdBy,
      });
      return updated;
    });
  }

  const payment = await prisma.payment.findFirst({ where: { id, businessLocation: { organizationId }, ...location } });
  if (!payment) throw new NotFoundError("Payment not found");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({ where: { id }, data: { paymentAccountId } });
    await syncPaymentAccountTransaction(tx, id);
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Sell Payments (ReportController@sellPaymentReport)
// ---------------------------------------------------------------------------

export async function sellPayments(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  // Reference: with no date range chosen the report shows today's payments only. Local date, not
  // toISOString() - that's the UTC date, which is still "yesterday" for hours after local midnight.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const from = new Date(`${String(query.from || today)}T00:00:00`);
  const to = endOfDay(query.to || today);

  const where: Prisma.PaymentWhereInput = {
    businessLocation: { organizationId },
    paymentDate: { gte: from, lte: to },
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
    ...(query.customerId ? { customerId: String(query.customerId) } : {}),
    ...(query.customerGroupId ? { customer: { customerGroupId: String(query.customerGroupId) } } : {}),
    ...(query.paymentMethodId ? { paymentMethodId: String(query.paymentMethodId) } : {}),
    ...(query.accountId ? { paymentAccountId: String(query.accountId) } : {}),
    ...(query.createdBy ? { createdBy: String(query.createdBy) } : {}),
    // Each app lists the payments of its own invoices (MIXED invoices in both).
    ...(parseAppScope(query) ? { sale: saleScopeWhere(parseAppScope(query)) } : {}),
  };

  const [rows, total, sums] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paymentDate: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        paymentRefNo: true,
        paymentDate: true,
        amount: true,
        type: true,
        referenceNumber: true,
        notes: true,
        paymentAccount: { select: { name: true } },
        paymentMethod: { select: { nameEn: true, nameAr: true, code: true } },
        customer: { select: { id: true, nameEn: true, nameAr: true, code: true, customerGroup: { select: { nameEn: true, nameAr: true } } } },
        sale: { select: { id: true, invoiceNumber: true } },
        businessLocation: { select: { branchName: true } },
        createdByUser: { select: { fullNameEn: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({ by: ["type"], where, _sum: { amount: true } }),
  ]);

  // Refunds paid out are shown negative (reference's is_return => -1 * amount).
  const data = rows.map((r) => ({ ...r, signedAmount: r.type === "REFUND" ? r.amount.neg() : r.amount }));
  const totalAmount = sums.reduce((s, g) => (g.type === "REFUND" ? s.sub(g._sum.amount ?? 0) : s.add(g._sum.amount ?? 0)), new Decimal(0));
  return { data, meta: { page, limit, total }, totals: { amount: totalAmount.toDecimalPlaces(2) } };
}
