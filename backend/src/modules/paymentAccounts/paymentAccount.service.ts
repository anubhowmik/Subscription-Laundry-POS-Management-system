import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError, ValidationError } from "../../utils/AppError";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

// ---------------------------------------------------------------------------
// Scoping - reference's location-based account restriction (AccountController@index): a user who
// is not unrestricted only sees accounts set as a default payment account of one of their branches.
// ---------------------------------------------------------------------------

export async function scopedAccountIds(allowedLocationIds: string[] | null): Promise<string[] | null> {
  if (!allowedLocationIds) return null;
  const rows = await prisma.businessLocationPaymentAccount.findMany({
    where: { businessLocationId: { in: allowedLocationIds } },
    select: { paymentAccountId: true },
  });
  return [...new Set(rows.map((r) => r.paymentAccountId))];
}

/** Reference's `location_id` report filter - the accounts that branch's payment options point at. */
export async function locationAccountIds(businessLocationId: string): Promise<string[]> {
  const rows = await prisma.businessLocationPaymentAccount.findMany({ where: { businessLocationId }, select: { paymentAccountId: true } });
  return [...new Set(rows.map((r) => r.paymentAccountId))];
}

function intersect(a: string[] | null, b: string[] | null): string[] | null {
  if (a === null) return b;
  if (b === null) return a;
  const set = new Set(b);
  return a.filter((id) => set.has(id));
}

/** credits - debits per account (reference: SUM(IF(type='credit', amount, -amount))). */
export async function balancesByAccount(where: Prisma.PaymentAccountTransactionWhereInput): Promise<Map<string, Decimal>> {
  const groups = await prisma.paymentAccountTransaction.groupBy({ by: ["paymentAccountId", "type"], where, _sum: { amount: true } });
  const balances = new Map<string, Decimal>();
  for (const g of groups) {
    const amount = g._sum.amount ?? new Decimal(0);
    const current = balances.get(g.paymentAccountId) ?? new Decimal(0);
    balances.set(g.paymentAccountId, g.type === "CREDIT" ? current.add(amount) : current.sub(amount));
  }
  return balances;
}

export async function assertPaymentAccountUsable(paymentAccountId: string | null | undefined, organizationId: string) {
  if (!paymentAccountId) return;
  const account = await prisma.paymentAccount.findFirst({ where: { id: paymentAccountId, organizationId } });
  if (!account) throw new NotFoundError("Payment account not found");
  if (account.isClosed) throw new ValidationError([{ field: "paymentAccountId", message: "This payment account is closed" }]);
}

/** Branch-restricted users may only touch accounts that are a default payment account of one of
 * their branches - the same scope the account list uses, applied to every by-id action too. */
export async function assertInScope(id: string, allowedLocationIds: string[] | null) {
  const scope = await scopedAccountIds(allowedLocationIds);
  if (scope && !scope.includes(id)) throw new NotFoundError("Payment account not found");
}

async function getAccountOrThrow(id: string, organizationId: string, allowedLocationIds: string[] | null = null) {
  const account = await prisma.paymentAccount.findFirst({ where: { id, organizationId } });
  if (!account) throw new NotFoundError("Payment account not found");
  await assertInScope(id, allowedLocationIds);
  return account;
}

// ---------------------------------------------------------------------------
// Account types (AccountTypeController)
// ---------------------------------------------------------------------------

export async function listTypes(organizationId: string) {
  return prisma.paymentAccountType.findMany({
    where: { organizationId, parentAccountTypeId: null },
    orderBy: { name: "asc" },
    include: { subTypes: { orderBy: { name: "asc" } } },
  });
}

async function assertParentType(parentAccountTypeId: string | null | undefined, organizationId: string, selfId?: string) {
  if (!parentAccountTypeId) return;
  if (parentAccountTypeId === selfId) throw new ValidationError([{ field: "parentAccountTypeId", message: "A type cannot be its own parent" }]);
  const parent = await prisma.paymentAccountType.findFirst({ where: { id: parentAccountTypeId, organizationId } });
  if (!parent) throw new NotFoundError("Parent account type not found");
  if (parent.parentAccountTypeId) {
    throw new ValidationError([{ field: "parentAccountTypeId", message: "Only a top-level type can be a parent" }]);
  }
}

export async function createType(input: { name: string; parentAccountTypeId?: string | null }, organizationId: string) {
  await assertParentType(input.parentAccountTypeId, organizationId);
  return prisma.paymentAccountType.create({
    data: { organizationId, name: input.name, parentAccountTypeId: input.parentAccountTypeId || null },
  });
}

export async function updateType(id: string, input: { name: string; parentAccountTypeId?: string | null }, organizationId: string) {
  const type = await prisma.paymentAccountType.findFirst({ where: { id, organizationId } });
  if (!type) throw new NotFoundError("Account type not found");
  await assertParentType(input.parentAccountTypeId, organizationId, id);

  return prisma.$transaction(async (tx) => {
    // Reference: when a top-level type becomes a sub-type, its own sub-types move under the new parent.
    if (!type.parentAccountTypeId && input.parentAccountTypeId) {
      await tx.paymentAccountType.updateMany({
        where: { organizationId, parentAccountTypeId: id },
        data: { parentAccountTypeId: input.parentAccountTypeId },
      });
    }
    return tx.paymentAccountType.update({ where: { id }, data: { name: input.name, parentAccountTypeId: input.parentAccountTypeId || null } });
  });
}

export async function deleteType(id: string, organizationId: string) {
  const type = await prisma.paymentAccountType.findFirst({ where: { id, organizationId } });
  if (!type) throw new NotFoundError("Account type not found");
  await prisma.$transaction(async (tx) => {
    // Reference: a deleted type's sub-types are promoted to top-level, not deleted with it.
    await tx.paymentAccountType.updateMany({ where: { organizationId, parentAccountTypeId: id }, data: { parentAccountTypeId: null } });
    await tx.paymentAccountType.delete({ where: { id } });
  });
}

// ---------------------------------------------------------------------------
// Accounts (AccountController index/store/update/close/activate)
// ---------------------------------------------------------------------------

const ACCOUNT_INCLUDE = {
  accountType: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } },
  createdByUser: { select: { fullNameEn: true } },
} satisfies Prisma.PaymentAccountInclude;

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const scope = await scopedAccountIds(allowedLocationIds);
  const accounts = await prisma.paymentAccount.findMany({
    where: {
      organizationId,
      isClosed: query.status === "closed",
      ...(scope ? { id: { in: scope } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: String(query.search), mode: "insensitive" } },
              { accountNumber: { contains: String(query.search), mode: "insensitive" } },
              { note: { contains: String(query.search), mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    include: ACCOUNT_INCLUDE,
  });
  const balances = await balancesByAccount({ paymentAccountId: { in: accounts.map((a) => a.id) } });
  return accounts.map((a) => ({ ...a, balance: (balances.get(a.id) ?? new Decimal(0)).toDecimalPlaces(2) }));
}

/** Account::forDropdown - open accounts (optionally closed too) for every account select. */
export async function dropdown(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const scope = await scopedAccountIds(allowedLocationIds);
  return prisma.paymentAccount.findMany({
    where: {
      organizationId,
      ...(query.includeClosed === "true" ? {} : { isClosed: false }),
      ...(query.kind ? { kind: query.kind as "BANK" | "CASH" | "CHEQUE" } : {}),
      ...(scope ? { id: { in: scope } } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, accountNumber: true, kind: true, isClosed: true },
  });
}

export async function getById(id: string, organizationId: string, allowedLocationIds: string[] | null = null) {
  const account = await prisma.paymentAccount.findFirst({ where: { id, organizationId }, include: ACCOUNT_INCLUDE });
  if (!account) throw new NotFoundError("Payment account not found");
  await assertInScope(id, allowedLocationIds);
  const balances = await balancesByAccount({ paymentAccountId: id });
  return { ...account, balance: (balances.get(id) ?? new Decimal(0)).toDecimalPlaces(2) };
}

interface AccountInput {
  name: string;
  accountNumber: string;
  kind?: "BANK" | "CASH" | "CHEQUE";
  accountTypeId?: string | null;
  openingBalance?: number;
  accountDetails?: { label?: string; value?: string }[];
  note?: string | null;
  isMajor?: boolean;
}

async function assertAccountType(accountTypeId: string | null | undefined, organizationId: string) {
  if (!accountTypeId) return;
  const type = await prisma.paymentAccountType.findFirst({ where: { id: accountTypeId, organizationId } });
  if (!type) throw new NotFoundError("Account type not found");
}

function cleanDetails(details: AccountInput["accountDetails"]) {
  const rows = (details ?? []).filter((d) => d.label?.trim() || d.value?.trim()).map((d) => ({ label: d.label?.trim() ?? "", value: d.value?.trim() ?? "" }));
  return rows.length > 0 ? rows : Prisma.JsonNull;
}

export async function create(input: AccountInput, organizationId: string, createdBy: string) {
  await assertAccountType(input.accountTypeId, organizationId);
  return prisma.$transaction(async (tx) => {
    const account = await tx.paymentAccount.create({
      data: {
        organizationId,
        name: input.name,
        accountNumber: input.accountNumber,
        kind: input.kind ?? "BANK",
        accountTypeId: input.accountTypeId || null,
        accountDetails: cleanDetails(input.accountDetails),
        note: input.note || null,
        isMajor: input.isMajor ?? false,
        createdBy,
      },
    });
    if (input.openingBalance) {
      await tx.paymentAccountTransaction.create({
        data: {
          paymentAccountId: account.id,
          type: "CREDIT",
          subType: "OPENING_BALANCE",
          amount: new Decimal(input.openingBalance).toDecimalPlaces(2),
          createdBy,
        },
      });
    }
    return account;
  });
}

export async function update(id: string, input: AccountInput, organizationId: string, allowedLocationIds: string[] | null = null) {
  await getAccountOrThrow(id, organizationId, allowedLocationIds);
  await assertAccountType(input.accountTypeId, organizationId);
  return prisma.paymentAccount.update({
    where: { id },
    data: {
      name: input.name,
      accountNumber: input.accountNumber,
      kind: input.kind ?? "BANK",
      accountTypeId: input.accountTypeId || null,
      accountDetails: cleanDetails(input.accountDetails),
      note: input.note || null,
      isMajor: input.isMajor ?? false,
    },
  });
}

export async function setClosed(id: string, isClosed: boolean, organizationId: string, allowedLocationIds: string[] | null = null) {
  await getAccountOrThrow(id, organizationId, allowedLocationIds);
  return prisma.paymentAccount.update({ where: { id }, data: { isClosed } });
}

// ---------------------------------------------------------------------------
// Movement descriptions - reference's __getPaymentDetails(), returned as structured data
// ---------------------------------------------------------------------------

export const TXN_INCLUDE = {
  paymentAccount: { select: { id: true, name: true } },
  createdByUser: { select: { fullNameEn: true } },
  transferTransaction: { select: { id: true, paymentAccount: { select: { id: true, name: true } } } },
  transferredFrom: { select: { id: true, paymentAccount: { select: { id: true, name: true } } } },
  payment: {
    select: {
      id: true,
      type: true,
      paymentRefNo: true,
      sale: { select: { id: true, invoiceNumber: true } },
      customer: { select: { nameEn: true, nameAr: true } },
    },
  },
  expense: { select: { id: true, expenseNumber: true, supplier: { select: { nameEn: true } } } },
  purchase: { select: { id: true, referenceNumber: true, supplier: { select: { nameEn: true } } } },
} satisfies Prisma.PaymentAccountTransactionInclude;

type TxnRow = Prisma.PaymentAccountTransactionGetPayload<{ include: typeof TXN_INCLUDE }>;

export function describe(t: TxnRow) {
  const counterpart = t.transferTransaction ?? t.transferredFrom;
  let docType: "SALE" | "SELL_RETURN" | "EXPENSE" | "PURCHASE" | null = null;
  let docNumber: string | null = null;
  let docId: string | null = null;
  let party: string | null = null;
  if (t.payment) {
    docType = t.payment.type === "REFUND" ? "SELL_RETURN" : "SALE";
    docNumber = t.payment.sale?.invoiceNumber ?? null;
    docId = t.payment.sale?.id ?? null;
    party = t.payment.customer.nameEn;
  } else if (t.expense) {
    docType = "EXPENSE";
    docNumber = t.expense.expenseNumber;
    docId = t.expense.id;
    party = t.expense.supplier?.nameEn ?? null;
  } else if (t.purchase) {
    docType = "PURCHASE";
    docNumber = t.purchase.referenceNumber;
    docId = t.purchase.id;
    party = t.purchase.supplier.nameEn;
  }
  return {
    subType: t.subType,
    // For a transfer/deposit leg: the OTHER account ("from" when this leg is the credit, "to" when the debit).
    counterAccountName: counterpart?.paymentAccount.name ?? null,
    docType,
    docNumber,
    docId,
    party,
    paymentRefNo: t.payment?.paymentRefNo ?? null,
    addedBy: t.createdByUser.fullNameEn,
  };
}

function signed(t: { type: string; amount: Decimal }) {
  return t.type === "CREDIT" ? t.amount : t.amount.neg();
}

const TXN_ORDER: Prisma.PaymentAccountTransactionOrderByWithRelationInput[] = [{ operationDate: "asc" }, { createdAt: "asc" }, { id: "asc" }];

// ---------------------------------------------------------------------------
// Account Book (AccountController@show)
// ---------------------------------------------------------------------------

export async function accountBook(id: string, query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null = null) {
  const account = await getById(id, organizationId, allowedLocationIds);
  const from = query.from ? new Date(`${String(query.from)}T00:00:00`) : null;
  const to = query.to ? new Date(`${String(query.to)}T23:59:59.999`) : null;

  // Running balance is always over every movement on the account (not just the filtered ones),
  // so the Balance column stays the real balance after each shown row.
  const all = await prisma.paymentAccountTransaction.findMany({ where: { paymentAccountId: id }, orderBy: TXN_ORDER, include: TXN_INCLUDE });
  let running = new Decimal(0);
  const rows = [];
  for (const t of all) {
    running = running.add(signed(t));
    if (from && t.operationDate < from) continue;
    if (to && t.operationDate > to) continue;
    if (query.type && t.type !== query.type) continue;
    if (query.createdBy && t.createdBy !== query.createdBy) continue;
    rows.push({
      id: t.id,
      operationDate: t.operationDate,
      type: t.type,
      subType: t.subType,
      amount: t.amount,
      note: t.note,
      referenceNo: t.referenceNo,
      balance: running.toDecimalPlaces(2),
      description: describe(t),
    });
  }
  return { account, rows };
}

// ---------------------------------------------------------------------------
// Deposit / Fund transfer / edit & delete movement
// ---------------------------------------------------------------------------

interface DepositInput {
  accountId: string;
  amount: number;
  fromAccountId?: string | null;
  operationDate?: string;
  note?: string;
}

export async function deposit(input: DepositInput, organizationId: string, createdBy: string, allowedLocationIds: string[] | null = null) {
  const to = await getAccountOrThrow(input.accountId, organizationId, allowedLocationIds);
  if (to.isClosed) throw new ValidationError([{ field: "accountId", message: "This account is closed" }]);
  if (input.fromAccountId) {
    if (input.fromAccountId === input.accountId) throw new ValidationError([{ field: "fromAccountId", message: "Deposit From must be a different account" }]);
    await assertPaymentAccountUsable(input.fromAccountId, organizationId);
    await assertInScope(input.fromAccountId, allowedLocationIds);
  }
  const amount = new Decimal(input.amount).toDecimalPlaces(2);
  const operationDate = input.operationDate ? new Date(input.operationDate) : new Date();

  return prisma.$transaction(async (tx) => {
    const credit = await tx.paymentAccountTransaction.create({
      data: { paymentAccountId: input.accountId, type: "CREDIT", subType: "DEPOSIT", amount, operationDate, note: input.note || null, createdBy },
    });
    if (input.fromAccountId) {
      await tx.paymentAccountTransaction.create({
        data: {
          paymentAccountId: input.fromAccountId,
          type: "DEBIT",
          subType: "DEPOSIT",
          amount,
          operationDate,
          note: input.note || null,
          createdBy,
          transferTransactionId: credit.id,
        },
      });
    }
    return credit;
  });
}

interface FundTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  referenceNo?: string;
  operationDate?: string;
  note?: string;
}

export async function fundTransfer(input: FundTransferInput, organizationId: string, createdBy: string, allowedLocationIds: string[] | null = null) {
  if (input.fromAccountId === input.toAccountId) throw new ValidationError([{ field: "toAccountId", message: "Transfer To must be a different account" }]);
  await assertPaymentAccountUsable(input.fromAccountId, organizationId);
  await assertInScope(input.fromAccountId, allowedLocationIds);
  const toAccount = await getAccountOrThrow(input.toAccountId, organizationId, allowedLocationIds);
  if (toAccount.isClosed) throw new ValidationError([{ field: "toAccountId", message: "This account is closed" }]);
  // Reference: AccountController@getFundTransfer only lists type='bank' accounts as a destination.
  if (toAccount.kind !== "BANK") throw new ValidationError([{ field: "toAccountId", message: "Funds can only be transferred to a bank account" }]);

  const amount = new Decimal(input.amount).toDecimalPlaces(2);
  const operationDate = input.operationDate ? new Date(input.operationDate) : new Date();
  const base = { subType: "FUND_TRANSFER" as const, amount, operationDate, note: input.note || null, referenceNo: input.referenceNo || null, createdBy };

  return prisma.$transaction(async (tx) => {
    const credit = await tx.paymentAccountTransaction.create({ data: { ...base, paymentAccountId: input.toAccountId, type: "CREDIT" } });
    const debit = await tx.paymentAccountTransaction.create({
      data: { ...base, paymentAccountId: input.fromAccountId, type: "DEBIT", transferTransactionId: credit.id },
    });
    return debit;
  });
}

async function getManualTxnOrThrow(id: string, organizationId: string, allowedLocationIds: string[] | null = null) {
  const t = await prisma.paymentAccountTransaction.findFirst({
    where: { id, paymentAccount: { organizationId } },
    include: { paymentAccount: { select: { id: true, name: true } }, transferTransaction: true, transferredFrom: true },
  });
  if (!t) throw new NotFoundError("Account transaction not found");
  await assertInScope(t.paymentAccountId, allowedLocationIds);
  return t;
}

export async function getTransaction(id: string, organizationId: string, allowedLocationIds: string[] | null = null) {
  const t = await getManualTxnOrThrow(id, organizationId, allowedLocationIds);
  if (!t.subType) throw new AppError(409, "Only opening balance, deposit and fund transfer movements can be edited");
  const counterpart = t.transferTransaction ?? t.transferredFrom;
  return { ...t, counterAccountId: counterpart?.paymentAccountId ?? null };
}

interface UpdateTxnInput {
  accountId: string;
  amount: number;
  operationDate: string;
  note?: string | null;
  counterAccountId?: string | null;
}

/** AccountController@updateAccountTransaction - edits the leg and keeps its paired leg in step. */
export async function updateTransaction(id: string, input: UpdateTxnInput, organizationId: string, allowedLocationIds: string[] | null = null) {
  const t = await getManualTxnOrThrow(id, organizationId, allowedLocationIds);
  if (!t.subType) throw new AppError(409, "Only opening balance, deposit and fund transfer movements can be edited");
  await getAccountOrThrow(input.accountId, organizationId, allowedLocationIds);
  const counterpart = t.transferTransaction ?? t.transferredFrom;
  if (counterpart && input.counterAccountId) {
    await getAccountOrThrow(input.counterAccountId, organizationId, allowedLocationIds);
    if (input.counterAccountId === input.accountId) throw new ValidationError([{ field: "counterAccountId", message: "Both sides must be different accounts" }]);
  }
  const amount = new Decimal(input.amount).toDecimalPlaces(2);
  const operationDate = new Date(input.operationDate);
  const note = t.subType === "OPENING_BALANCE" ? t.note : input.note || null;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.paymentAccountTransaction.update({ where: { id }, data: { paymentAccountId: input.accountId, amount, operationDate, note } });
    if (counterpart) {
      await tx.paymentAccountTransaction.update({
        where: { id: counterpart.id },
        data: { amount, operationDate, note, ...(input.counterAccountId ? { paymentAccountId: input.counterAccountId } : {}) },
      });
    }
    return updated;
  });
}

/** AccountController@destroyAccountTransaction - only deposit/fund-transfer movements, both legs. */
export async function deleteTransaction(id: string, organizationId: string, allowedLocationIds: string[] | null = null) {
  const t = await getManualTxnOrThrow(id, organizationId, allowedLocationIds);
  if (t.subType !== "DEPOSIT" && t.subType !== "FUND_TRANSFER") {
    throw new AppError(409, "Only deposit and fund transfer movements can be deleted");
  }
  const counterpart = t.transferTransaction ?? t.transferredFrom;
  await prisma.$transaction(async (tx) => {
    // Unlink first - the self-relation's unique FK would otherwise block deleting either leg.
    await tx.paymentAccountTransaction.updateMany({ where: { id: { in: [t.id, ...(counterpart ? [counterpart.id] : [])] } }, data: { transferTransactionId: null } });
    await tx.paymentAccountTransaction.deleteMany({ where: { id: { in: [t.id, ...(counterpart ? [counterpart.id] : [])] } } });
  });
}

/** List Accounts page alert: "Total N payments not linked with any account". */
export async function notLinkedPaymentsCount(organizationId: string, allowedLocationIds: string[] | null) {
  return prisma.payment.count({
    where: {
      paymentAccountId: null,
      businessLocation: { organizationId },
      ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Branch default payment accounts (Business Location > Payment Options)
// ---------------------------------------------------------------------------

export async function getLocationDefaults(businessLocationId: string, organizationId: string) {
  const location = await prisma.businessLocation.findFirst({ where: { id: businessLocationId, organizationId } });
  if (!location) throw new NotFoundError("Business location not found");
  const [methods, mappings] = await Promise.all([
    prisma.paymentMethod.findMany({ where: { organizationId, isActive: true }, orderBy: { nameEn: "asc" } }),
    prisma.businessLocationPaymentAccount.findMany({ where: { businessLocationId } }),
  ]);
  const byMethod = new Map(mappings.map((m) => [m.paymentMethodId, m.paymentAccountId]));
  return methods.map((m) => ({ paymentMethodId: m.id, code: m.code, nameEn: m.nameEn, nameAr: m.nameAr, paymentAccountId: byMethod.get(m.id) ?? null }));
}

export async function setLocationDefaults(
  businessLocationId: string,
  items: { paymentMethodId: string; paymentAccountId: string | null }[],
  organizationId: string,
) {
  const location = await prisma.businessLocation.findFirst({ where: { id: businessLocationId, organizationId } });
  if (!location) throw new NotFoundError("Business location not found");
  const accountIds = [...new Set(items.map((i) => i.paymentAccountId).filter((id): id is string => Boolean(id)))];
  const methodIds = [...new Set(items.map((i) => i.paymentMethodId))];
  const [accounts, methods] = await Promise.all([
    prisma.paymentAccount.count({ where: { id: { in: accountIds }, organizationId } }),
    prisma.paymentMethod.count({ where: { id: { in: methodIds }, organizationId } }),
  ]);
  if (accounts !== accountIds.length) throw new NotFoundError("One or more payment accounts not found");
  if (methods !== methodIds.length) throw new NotFoundError("One or more payment methods not found");

  await prisma.$transaction(async (tx) => {
    await tx.businessLocationPaymentAccount.deleteMany({ where: { businessLocationId } });
    const data = items.filter((i) => i.paymentAccountId).map((i) => ({ businessLocationId, paymentMethodId: i.paymentMethodId, paymentAccountId: i.paymentAccountId! }));
    if (data.length > 0) await tx.businessLocationPaymentAccount.createMany({ data });
  });
  return getLocationDefaults(businessLocationId, organizationId);
}

/** Options for the report filter dropdowns (Created By / Service Staff, Customer Group, Customer).
 * Served from this module so a user who only has accounting permissions still gets them - the
 * general /users, /customer-groups and /customers endpoints need those modules' own permissions. */
export async function filterOptions(organizationId: string) {
  const [users, customerGroups] = await Promise.all([
    prisma.user.findMany({ where: { organizationId, deletedAt: null }, orderBy: { fullNameEn: "asc" }, select: { id: true, fullNameEn: true } }),
    prisma.customerGroup.findMany({ where: { organizationId }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
  ]);
  return { users, customerGroups };
}

export async function customerSearch(search: string, organizationId: string) {
  if (!search.trim()) return [];
  return prisma.customer.findMany({
    where: {
      organizationId,
      OR: [
        { nameEn: { contains: search, mode: "insensitive" } },
        { nameAr: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { code: { contains: search, mode: "insensitive" } },
      ],
    },
    take: 20,
    orderBy: { nameEn: "asc" },
    select: { id: true, nameEn: true, nameAr: true, phone: true, code: true },
  });
}

export { intersect, signed, TXN_ORDER };
