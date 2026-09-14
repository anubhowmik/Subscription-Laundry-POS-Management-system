import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/AppError";

// Asset/Expense are debit-normal (balance = debits - credits); Liability/Equity/Revenue are
// credit-normal (balance = credits - debits) - standard double-entry sign convention.
const DEBIT_NORMAL: Record<string, boolean> = { ASSET: true, EXPENSE: true, LIABILITY: false, EQUITY: false, REVENUE: false };

export async function list(organizationId: string) {
  const accounts = await prisma.account.findMany({
    where: { organizationId },
    orderBy: [{ accountType: "asc" }, { code: "asc" }],
  });
  const balances = await balanceMap(organizationId);
  const withBalance = accounts.map((a) => ({ ...a, balance: balances.get(a.id) ?? Number(a.openingBalance) }));

  // Tree-shaped: top-level accounts with childAccounts nested one level deep, matching the
  // reference's 2-level Account/AccountType hierarchy.
  const byParent = new Map<string, typeof withBalance>();
  for (const a of withBalance) {
    const key = a.parentAccountId ?? "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(a);
  }
  const topLevel = byParent.get("") ?? [];
  return topLevel.map((a) => ({ ...a, childAccounts: byParent.get(a.id) ?? [] }));
}

export async function getById(id: string, organizationId: string) {
  const account = await prisma.account.findFirst({ where: { id, organizationId } });
  if (!account) throw new NotFoundError("Account not found");
  return account;
}

/** Sum of posted JournalLine debit/credit per account, sign-adjusted by account type. Accounts
 * with no journal activity yet just fall back to their openingBalance (handled by the caller). */
async function balanceMap(organizationId: string): Promise<Map<string, number>> {
  const rows = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: { journalEntry: { organizationId, postedAt: { not: null } } },
    _sum: { debit: true, credit: true },
  });
  const accounts = await prisma.account.findMany({ where: { organizationId }, select: { id: true, accountType: true, openingBalance: true } });
  const typeById = new Map(accounts.map((a) => [a.id, a.accountType]));
  const openingById = new Map(accounts.map((a) => [a.id, Number(a.openingBalance)]));
  const map = new Map<string, number>();
  for (const r of rows) {
    const debitNormal = DEBIT_NORMAL[typeById.get(r.accountId) ?? "ASSET"];
    const debit = Number(r._sum.debit ?? 0);
    const credit = Number(r._sum.credit ?? 0);
    const movement = debitNormal ? debit - credit : credit - debit;
    map.set(r.accountId, (openingById.get(r.accountId) ?? 0) + movement);
  }
  return map;
}

export async function create(input: Prisma.AccountUncheckedCreateInput, organizationId: string) {
  if (input.parentAccountId) {
    const parent = await prisma.account.findFirst({ where: { id: input.parentAccountId as string, organizationId } });
    if (!parent) throw new ValidationError([{ field: "parentAccountId", message: "Parent account not found" }]);
    if (parent.accountType !== input.accountType) {
      throw new ValidationError([{ field: "parentAccountId", message: "Parent account must be the same account type" }]);
    }
  }
  try {
    return await prisma.account.create({ data: { ...input, organizationId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("An account with this code already exists");
    }
    throw err;
  }
}

export async function update(id: string, input: Prisma.AccountUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  try {
    return await prisma.account.update({ where: { id }, data: input });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("An account with this code already exists");
    }
    throw err;
  }
}

export async function deactivate(id: string, organizationId: string) {
  const account = await getById(id, organizationId);
  if (account.isSystemAccount) throw new ValidationError([{ field: "id", message: "System accounts cannot be deactivated" }]);
  return prisma.account.update({ where: { id }, data: { isActive: false } });
}

/**
 * Seeds a standard starter Chart of Accounts for a newly-registered organization - called once
 * from organization.service.ts's registerOrganization(), inside the same transaction that seeds
 * default PaymentMethods/master data. Deliberately simple (one level of children, no attempt to
 * mirror ExpenseCategory rows since those don't exist yet at registration time) - a business can
 * add/reorganize accounts freely afterward via the Chart of Accounts page. Marked
 * `isSystemAccount: true` so these can't be accidentally deleted.
 */
export async function seedDefaultChartOfAccounts(tx: Prisma.TransactionClient, organizationId: string) {
  const parents = [
    { code: "1000", nameEn: "Assets", nameAr: "الأصول", accountType: "ASSET" as const },
    { code: "2000", nameEn: "Liabilities", nameAr: "الخصوم", accountType: "LIABILITY" as const },
    { code: "3000", nameEn: "Equity", nameAr: "حقوق الملكية", accountType: "EQUITY" as const },
    { code: "4000", nameEn: "Revenue", nameAr: "الإيرادات", accountType: "REVENUE" as const },
    { code: "5000", nameEn: "Expenses", nameAr: "المصروفات", accountType: "EXPENSE" as const },
  ];
  const parentIds: Record<string, string> = {};
  for (const p of parents) {
    const created = await tx.account.create({ data: { organizationId, ...p, isSystemAccount: true } });
    parentIds[p.code] = created.id;
  }

  const children = [
    { code: "1010", nameEn: "Cash", nameAr: "النقدية", accountType: "ASSET" as const, parent: "1000" },
    { code: "1020", nameEn: "Bank", nameAr: "البنك", accountType: "ASSET" as const, parent: "1000" },
    { code: "1030", nameEn: "Accounts Receivable", nameAr: "ذمم مدينة", accountType: "ASSET" as const, parent: "1000" },
    { code: "2010", nameEn: "Accounts Payable", nameAr: "ذمم دائنة", accountType: "LIABILITY" as const, parent: "2000" },
    { code: "2020", nameEn: "VAT Payable", nameAr: "ضريبة القيمة المضافة المستحقة", accountType: "LIABILITY" as const, parent: "2000" },
    { code: "3010", nameEn: "Owner's Equity", nameAr: "حقوق المالك", accountType: "EQUITY" as const, parent: "3000" },
    { code: "3020", nameEn: "Retained Earnings", nameAr: "الأرباح المحتجزة", accountType: "EQUITY" as const, parent: "3000" },
    { code: "4010", nameEn: "Sales Revenue", nameAr: "إيرادات المبيعات", accountType: "REVENUE" as const, parent: "4000" },
    { code: "4020", nameEn: "Sales Returns & Allowances", nameAr: "مردودات ومسموحات المبيعات", accountType: "REVENUE" as const, parent: "4000" },
    { code: "5010", nameEn: "Purchases / COGS", nameAr: "المشتريات / تكلفة البضاعة المباعة", accountType: "EXPENSE" as const, parent: "5000" },
    { code: "5020", nameEn: "General Expenses", nameAr: "مصروفات عمومية", accountType: "EXPENSE" as const, parent: "5000" },
  ];
  for (const c of children) {
    await tx.account.create({
      data: { organizationId, code: c.code, nameEn: c.nameEn, nameAr: c.nameAr, accountType: c.accountType, parentAccountId: parentIds[c.parent], isSystemAccount: true },
    });
  }
}
