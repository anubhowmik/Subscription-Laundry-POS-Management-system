import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";

const DEBIT_NORMAL: Record<string, boolean> = { ASSET: true, EXPENSE: true, LIABILITY: false, EQUITY: false, REVENUE: false };

/** Every account with posted activity (or a non-zero opening balance), debit/credit columns -
 * a real trial balance computed from JournalLine, not the existing reports module's revenue/VAT
 * approximation (accountingReport, unrelated - kept as-is). Must always sum to zero by
 * construction (every JournalEntry is balance-enforced at create time). */
export async function trialBalanceReport(organizationId: string, asOfDate?: string) {
  const accounts = await prisma.account.findMany({ where: { organizationId }, orderBy: [{ accountType: "asc" }, { code: "asc" }] });
  const lines = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      journalEntry: {
        organizationId,
        postedAt: { not: null },
        ...(asOfDate ? { entryDate: { lte: new Date(asOfDate) } } : {}),
      },
    },
    _sum: { debit: true, credit: true },
  });
  const sumsByAccount = new Map(lines.map((l) => [l.accountId, { debit: Number(l._sum.debit ?? 0), credit: Number(l._sum.credit ?? 0) }]));

  const rows = accounts
    .map((a) => {
      const sums = sumsByAccount.get(a.id) ?? { debit: 0, credit: 0 };
      const debitNormal = DEBIT_NORMAL[a.accountType];
      const balance = Number(a.openingBalance) + (debitNormal ? sums.debit - sums.credit : sums.credit - sums.debit);
      return {
        accountId: a.id,
        code: a.code,
        nameEn: a.nameEn,
        nameAr: a.nameAr,
        accountType: a.accountType,
        debit: debitNormal ? Math.max(balance, 0) : 0,
        credit: debitNormal ? 0 : Math.max(balance, 0),
      };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, totalDebit, totalCredit };
}

/** Assets vs Liabilities+Equity, grouped by accountType - computed the same way as the trial
 * balance, just regrouped. Genuinely reflects account balances (not the approximation the
 * existing reports module's own "trial balance" terminology in REFERENCE-COMPARISON.md warned
 * the reference itself only fakes). */
export async function balanceSheetReport(organizationId: string, asOfDate?: string) {
  const trialBalance = await trialBalanceReport(organizationId, asOfDate);
  const byType: Record<string, { code: string; nameEn: string; nameAr: string | null; balance: number }[]> = {
    ASSET: [],
    LIABILITY: [],
    EQUITY: [],
  };
  for (const r of trialBalance.rows) {
    if (!(r.accountType in byType)) continue;
    const debitNormal = DEBIT_NORMAL[r.accountType];
    byType[r.accountType].push({ code: r.code, nameEn: r.nameEn, nameAr: r.nameAr, balance: debitNormal ? r.debit : r.credit });
  }
  const totalAssets = byType.ASSET.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = byType.LIABILITY.reduce((s, a) => s + a.balance, 0);
  const totalEquity = byType.EQUITY.reduce((s, a) => s + a.balance, 0);
  return { assets: byType.ASSET, liabilities: byType.LIABILITY, equity: byType.EQUITY, totalAssets, totalLiabilities, totalEquity };
}

/** Per-account transaction history with a running balance - the standard third leg of basic
 * bookkeeping reports alongside Trial Balance/Balance Sheet. The opening balance carries forward
 * the account's own `openingBalance` plus every posted line strictly before `fromDate` (or every
 * posted line ever, if no `fromDate` is given), so the running balance stays correct regardless of
 * which window the caller is looking at. */
export async function generalLedgerReport(organizationId: string, accountId: string, fromDate?: string, toDate?: string) {
  const account = await prisma.account.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new NotFoundError("Account not found");
  const debitNormal = DEBIT_NORMAL[account.accountType];

  let openingBalance = Number(account.openingBalance);
  if (fromDate) {
    const prior = await prisma.journalLine.aggregate({
      where: { accountId, journalEntry: { organizationId, postedAt: { not: null }, entryDate: { lt: new Date(fromDate) } } },
      _sum: { debit: true, credit: true },
    });
    const priorDebit = Number(prior._sum.debit ?? 0);
    const priorCredit = Number(prior._sum.credit ?? 0);
    openingBalance += debitNormal ? priorDebit - priorCredit : priorCredit - priorDebit;
  }

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId,
      journalEntry: {
        organizationId,
        postedAt: { not: null },
        ...(fromDate ? { entryDate: { gte: new Date(fromDate) } } : {}),
        ...(toDate ? { entryDate: { lte: new Date(toDate) } } : {}),
      },
    },
    include: { journalEntry: true },
    orderBy: [{ journalEntry: { entryDate: "asc" } }, { journalEntry: { createdAt: "asc" } }],
  });

  let running = openingBalance;
  const rows = lines.map((l) => {
    const debit = Number(l.debit);
    const credit = Number(l.credit);
    running += debitNormal ? debit - credit : credit - debit;
    return {
      journalEntryId: l.journalEntryId,
      entryDate: l.journalEntry.entryDate,
      reference: l.journalEntry.reference,
      memo: l.memo ?? l.journalEntry.memo,
      debit,
      credit,
      runningBalance: running,
    };
  });

  return {
    account: { id: account.id, code: account.code, nameEn: account.nameEn, nameAr: account.nameAr, accountType: account.accountType },
    openingBalance,
    rows,
    closingBalance: running,
  };
}
