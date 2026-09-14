import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Account, ApiSuccess, BalanceSheetReport, GeneralLedgerReport, TrialBalanceReport } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney, formatDate } from "../../lib/format";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { TableContainer, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";

type Tab = "TRIAL_BALANCE" | "BALANCE_SHEET" | "GENERAL_LEDGER";

export default function AccountingReportsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const [tab, setTab] = useState<Tab>("TRIAL_BALANCE");
  const [asOfDate, setAsOfDate] = useState("");
  const [glAccountId, setGlAccountId] = useState("");
  const [glFromDate, setGlFromDate] = useState("");
  const [glToDate, setGlToDate] = useState("");

  const { data: accounts } = useQuery({
    queryKey: ["accounting-accounts-flat"],
    queryFn: async () => (await api.get<ApiSuccess<Account[]>>("/accounting/accounts")).data.data,
    enabled: tab === "GENERAL_LEDGER",
  });
  const flatAccounts = (accounts ?? []).flatMap((a) => [a, ...(a.childAccounts ?? [])]);

  const { data: trialBalance } = useQuery({
    queryKey: ["accounting-trial-balance", asOfDate],
    queryFn: async () =>
      (
        await api.get<ApiSuccess<TrialBalanceReport>>("/accounting/reports/trial-balance", {
          params: asOfDate ? { asOfDate } : undefined,
        })
      ).data.data,
    enabled: tab === "TRIAL_BALANCE",
  });

  const { data: balanceSheet } = useQuery({
    queryKey: ["accounting-balance-sheet", asOfDate],
    queryFn: async () =>
      (
        await api.get<ApiSuccess<BalanceSheetReport>>("/accounting/reports/balance-sheet", {
          params: asOfDate ? { asOfDate } : undefined,
        })
      ).data.data,
    enabled: tab === "BALANCE_SHEET",
  });

  const { data: generalLedger } = useQuery({
    queryKey: ["accounting-general-ledger", glAccountId, glFromDate, glToDate],
    queryFn: async () =>
      (
        await api.get<ApiSuccess<GeneralLedgerReport>>("/accounting/reports/general-ledger", {
          params: { accountId: glAccountId, ...(glFromDate ? { fromDate: glFromDate } : {}), ...(glToDate ? { toDate: glToDate } : {}) },
        })
      ).data.data,
    enabled: tab === "GENERAL_LEDGER" && !!glAccountId,
  });

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "ميزان المراجعة والميزانية العمومية" : "Trial Balance & Balance Sheet"} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-6 border-b border-slate-200">
          <button
            onClick={() => setTab("TRIAL_BALANCE")}
            className={`pb-2 text-sm font-semibold transition ${tab === "TRIAL_BALANCE" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isAr ? "ميزان المراجعة" : "Trial Balance"}
          </button>
          <button
            onClick={() => setTab("BALANCE_SHEET")}
            className={`pb-2 text-sm font-semibold transition ${tab === "BALANCE_SHEET" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isAr ? "الميزانية العمومية" : "Balance Sheet"}
          </button>
          <button
            onClick={() => setTab("GENERAL_LEDGER")}
            className={`pb-2 text-sm font-semibold transition ${tab === "GENERAL_LEDGER" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isAr ? "دفتر الأستاذ العام" : "General Ledger"}
          </button>
        </div>
        {tab !== "GENERAL_LEDGER" && (
          <div>
            <label className={labelClass}>{isAr ? "كما في تاريخ" : "As of Date"}</label>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className={inputClass + " ltr-nums"} />
          </div>
        )}
        {tab === "GENERAL_LEDGER" && (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelClass}>{isAr ? "الحساب" : "Account"}</label>
              <select value={glAccountId} onChange={(e) => setGlAccountId(e.target.value)} className={selectClass}>
                <option value="">{isAr ? "اختر حسابًا" : "Select an account"}</option>
                {flatAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {isAr ? a.nameAr || a.nameEn : a.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "من" : "From"}</label>
              <input type="date" value={glFromDate} onChange={(e) => setGlFromDate(e.target.value)} className={inputClass + " ltr-nums"} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "إلى" : "To"}</label>
              <input type="date" value={glToDate} onChange={(e) => setGlToDate(e.target.value)} className={inputClass + " ltr-nums"} />
            </div>
          </div>
        )}
      </div>

      {tab === "TRIAL_BALANCE" && trialBalance && (
        <Card>
          <TableContainer>
            <TableScroll>
              <Table>
                <THead>
                  <tr>
                    <Th>{isAr ? "الرمز" : "Code"}</Th>
                    <Th>{isAr ? "الحساب" : "Account"}</Th>
                    <Th>{isAr ? "مدين" : "Debit"}</Th>
                    <Th>{isAr ? "دائن" : "Credit"}</Th>
                  </tr>
                </THead>
                <tbody>
                  {trialBalance.rows.map((row) => (
                    <tr key={row.accountId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-3 ltr-nums">{row.code}</td>
                      <td className="px-4 py-3">{isAr ? row.nameAr || row.nameEn : row.nameEn}</td>
                      <td className="px-4 py-3 ltr-nums">{row.debit ? formatMoney(row.debit, currency, locale) : ""}</td>
                      <td className="px-4 py-3 ltr-nums">{row.credit ? formatMoney(row.credit, currency, locale) : ""}</td>
                    </tr>
                  ))}
                  {trialBalance.rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                        {isAr ? "لا توجد بيانات" : "No data"}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <td className="px-4 py-3" colSpan={2}>
                      {isAr ? "الإجمالي" : "Total"}
                    </td>
                    <td className="px-4 py-3 ltr-nums">{formatMoney(trialBalance.totalDebit, currency, locale)}</td>
                    <td className="px-4 py-3 ltr-nums">{formatMoney(trialBalance.totalCredit, currency, locale)}</td>
                  </tr>
                </tfoot>
              </Table>
            </TableScroll>
          </TableContainer>
          <div className="mt-3 flex justify-end">
            <Badge variant={Math.round(trialBalance.totalDebit * 100) === Math.round(trialBalance.totalCredit * 100) ? "success" : "danger"}>
              {Math.round(trialBalance.totalDebit * 100) === Math.round(trialBalance.totalCredit * 100)
                ? isAr
                  ? "متوازن"
                  : "Balanced"
                : isAr
                  ? "غير متوازن"
                  : "Not balanced"}
            </Badge>
          </div>
        </Card>
      )}

      {tab === "BALANCE_SHEET" && balanceSheet && (
        <div className="grid gap-4 md:grid-cols-3">
          <BalanceSheetGroup title={isAr ? "الأصول" : "Assets"} lines={balanceSheet.assets} total={balanceSheet.totalAssets} currency={currency} locale={locale} isAr={isAr} />
          <BalanceSheetGroup title={isAr ? "الخصوم" : "Liabilities"} lines={balanceSheet.liabilities} total={balanceSheet.totalLiabilities} currency={currency} locale={locale} isAr={isAr} />
          <BalanceSheetGroup title={isAr ? "حقوق الملكية" : "Equity"} lines={balanceSheet.equity} total={balanceSheet.totalEquity} currency={currency} locale={locale} isAr={isAr} />
        </div>
      )}

      {tab === "GENERAL_LEDGER" && !glAccountId && (
        <p className="py-8 text-center text-slate-400">{isAr ? "اختر حسابًا لعرض دفتر الأستاذ الخاص به" : "Select an account to view its ledger"}</p>
      )}

      {tab === "GENERAL_LEDGER" && generalLedger && (
        <Card>
          <TableContainer>
            <TableScroll>
              <Table>
                <THead>
                  <tr>
                    <Th>{isAr ? "التاريخ" : "Date"}</Th>
                    <Th>{isAr ? "المرجع" : "Reference"}</Th>
                    <Th>{isAr ? "ملاحظة" : "Memo"}</Th>
                    <Th>{isAr ? "مدين" : "Debit"}</Th>
                    <Th>{isAr ? "دائن" : "Credit"}</Th>
                    <Th>{isAr ? "الرصيد" : "Balance"}</Th>
                  </tr>
                </THead>
                <tbody>
                  <tr className="border-b border-slate-100 bg-slate-50/60 font-medium">
                    <td className="px-4 py-3" colSpan={5}>
                      {isAr ? "الرصيد الافتتاحي" : "Opening Balance"}
                    </td>
                    <td className="px-4 py-3 ltr-nums">{formatMoney(generalLedger.openingBalance, currency, locale)}</td>
                  </tr>
                  {generalLedger.rows.map((row) => (
                    <tr key={row.journalEntryId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-3 ltr-nums">{formatDate(row.entryDate, locale)}</td>
                      <td className="px-4 py-3">{row.reference ?? "-"}</td>
                      <td className="px-4 py-3">{row.memo ?? "-"}</td>
                      <td className="px-4 py-3 ltr-nums">{row.debit ? formatMoney(row.debit, currency, locale) : ""}</td>
                      <td className="px-4 py-3 ltr-nums">{row.credit ? formatMoney(row.credit, currency, locale) : ""}</td>
                      <td className="px-4 py-3 ltr-nums">{formatMoney(row.runningBalance, currency, locale)}</td>
                    </tr>
                  ))}
                  {generalLedger.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        {isAr ? "لا توجد حركات في هذه الفترة" : "No transactions in this period"}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <td className="px-4 py-3" colSpan={5}>
                      {isAr ? "الرصيد الختامي" : "Closing Balance"}
                    </td>
                    <td className="px-4 py-3 ltr-nums">{formatMoney(generalLedger.closingBalance, currency, locale)}</td>
                  </tr>
                </tfoot>
              </Table>
            </TableScroll>
          </TableContainer>
        </Card>
      )}
    </div>
  );
}

function BalanceSheetGroup({
  title,
  lines,
  total,
  currency,
  locale,
  isAr,
}: {
  title: string;
  lines: { code: string; nameEn: string; nameAr: string | null; balance: number }[];
  total: number;
  currency: string;
  locale: string;
  isAr: boolean;
}) {
  return (
    <Card>
      <h3 className="mb-3 text-lg font-semibold text-slate-800">{title}</h3>
      <div className="space-y-2">
        {lines.map((line) => (
          <div key={line.code} className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{isAr ? line.nameAr || line.nameEn : line.nameEn}</span>
            <span className="ltr-nums font-medium">{formatMoney(line.balance, currency, locale)}</span>
          </div>
        ))}
        {lines.length === 0 && <p className="text-sm text-slate-400">{isAr ? "لا توجد بيانات" : "No data"}</p>}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 font-semibold">
        <span>{isAr ? "الإجمالي" : "Total"}</span>
        <span className="ltr-nums">{formatMoney(total, currency, locale)}</span>
      </div>
    </Card>
  );
}
