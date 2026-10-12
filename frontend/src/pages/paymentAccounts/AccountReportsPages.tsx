import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useAuth } from "../../contexts/AuthContext";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { TableContainer, TableToolbar } from "../../components/ui/Table";
import { FiltersMenu } from "../../components/ui/TableToolbarControls";
import { cn } from "../../lib/cn";
import { inputClass, selectClass } from "../../components/ui/formClasses";
import { FilterField, scopeParams, useReportAppScope } from "../reports/reportShared";
import { todayValue } from "./shared";

interface AccountBalance {
  id: string;
  name: string;
  balance: string;
}
interface BalanceSheetData {
  supplierDue: string;
  customerDue: string;
  closingStock: string;
  accountBalances: AccountBalance[];
  totalLiability: string;
  totalAssets: string;
}
interface TrialBalanceData {
  supplierDue: string;
  customerDue: string;
  accountBalances: AccountBalance[];
  totalDebit: string;
  totalCredit: string;
}

function useReportFilters() {
  const [businessLocationId, setBusinessLocationId] = useState("");
  const [endDate, setEndDate] = useState(todayValue());
  const appScope = useReportAppScope();
  // Reference: the report opens on today across all locations - that resting state is not a filter.
  const activeCount = (businessLocationId ? 1 : 0) + (endDate !== todayValue() ? 1 : 0);
  const clear = () => {
    setBusinessLocationId("");
    setEndDate(todayValue());
  };
  const params = { endDate, ...(businessLocationId ? { businessLocationId } : {}), ...scopeParams(appScope) };
  return { businessLocationId, setBusinessLocationId, endDate, setEndDate, activeCount, clear, params };
}

/** The Sales A/R table toolbar (Filters popover + Print) on top of the report body. */
function ReportShell({
  title,
  isAr,
  loading,
  filters,
  children,
}: {
  title: string;
  isAr: boolean;
  loading: boolean;
  filters: ReturnType<typeof useReportFilters>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { locations } = useBusinessLocation();
  const orgName = user?.organization ? (isAr ? user.organization.nameAr || user.organization.nameEn : user.organization.nameEn) : "";
  return (
    <TableContainer className="print-area">
      <TableToolbar className="print:hidden">
        <FiltersMenu activeCount={filters.activeCount} onClear={filters.clear} isAr={isAr}>
          <FilterField label={isAr ? "موقع العمل" : "Business Location"}>
            <select value={filters.businessLocationId} onChange={(e) => filters.setBusinessLocationId(e.target.value)} className={cn(selectClass, "w-full")}>
              <option value="">{t("common.all")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={isAr ? "تصفية حسب التاريخ" : "Filter by date"}>
            <input type="date" value={filters.endDate} onChange={(e) => filters.setEndDate(e.target.value || todayValue())} className={cn(inputClass, "w-full ltr-nums")} />
          </FilterField>
        </FiltersMenu>
        <div className="ms-auto">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "طباعة" : "Print"}
          </Button>
        </div>
      </TableToolbar>
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-800">
          {orgName ? `${orgName} - ` : ""}
          {title} - <span className="ltr-nums">{new Date(`${filters.endDate}T00:00:00`).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
        </h3>
      </div>
      <div className="p-5">{loading ? <Spinner /> : children}</div>
    </TableContainer>
  );
}

function Row({ label, value, indent }: { label: string; value?: ReactNode; indent?: boolean }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <th className={`py-2.5 text-start text-sm font-semibold text-slate-700 ${indent ? "!ps-8 font-normal text-slate-600" : ""}`}>{label}</th>
      <td className="py-2.5 text-end text-sm text-slate-800">{value}</td>
    </tr>
  );
}

// --- Balance Sheet (account_reports/balance_sheet.blade.php) ------------------------------------

export function BalanceSheetPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const money = (v: string | number) => <span className="ltr-nums">{formatMoney(v, currency, locale)}</span>;
  const filters = useReportFilters();

  const { data, isFetching } = useQuery({
    queryKey: ["payment-accounts", "balance-sheet", filters.params],
    queryFn: async () => (await api.get<ApiSuccess<BalanceSheetData>>("/payment-accounts/reports/balance-sheet", { params: filters.params })).data.data,
  });

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "الميزانية" : "Balance Sheet"} />
      <ReportShell title={isAr ? "الميزانية" : "Balance Sheet"} isAr={isAr} loading={isFetching && !data} filters={filters}>
        {data && (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="border-b border-slate-200 md:border-b-0 md:border-e">
                <div className="bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">{isAr ? "الخصوم" : "Liability"}</div>
                <table className="w-full px-4">
                  <tbody className="[&_td]:px-4 [&_th]:px-4">
                    <Row label={`${isAr ? "مستحقات المورد" : "Supplier Due"}:`} value={money(data.supplierDue)} />
                  </tbody>
                </table>
              </div>
              <div>
                <div className="bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">{isAr ? "الأصول" : "Assets"}</div>
                <table className="w-full">
                  <tbody className="[&_td]:px-4 [&_th]:px-4">
                    <Row label={`${isAr ? "مستحقات العميل" : "Customer Due"}:`} value={money(data.customerDue)} />
                    <Row label={`${isAr ? "مخزون اخر المدة" : "Closing Stock"}:`} value={money(data.closingStock)} />
                    <Row label={`${isAr ? "أرصدة الحسابات" : "Account Balances"}:`} />
                    {data.accountBalances.map((a) => (
                      <Row key={a.id} label={`${a.name}:`} value={money(a.balance)} indent />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="grid grid-cols-1 bg-slate-100 md:grid-cols-2">
              <div className="flex justify-between px-4 py-3 text-sm font-semibold text-slate-800 md:border-e md:border-slate-200">
                <span>{isAr ? "إجمالي الخصوم" : "Total Liability"}:</span>
                {money(data.totalLiability)}
              </div>
              <div className="flex justify-between px-4 py-3 text-sm font-semibold text-slate-800">
                <span>{isAr ? "إجمالي الأصول" : "Total Assets"}:</span>
                {money(data.totalAssets)}
              </div>
            </div>
          </div>
        )}
      </ReportShell>
    </div>
  );
}

// --- Trial Balance (account_reports/trial_balance.blade.php) ------------------------------------

export function TrialBalancePage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const money = (v: string | number) => <span className="ltr-nums">{formatMoney(v, currency, locale)}</span>;
  const filters = useReportFilters();

  const { data, isFetching } = useQuery({
    queryKey: ["payment-accounts", "trial-balance", filters.params],
    queryFn: async () => (await api.get<ApiSuccess<TrialBalanceData>>("/payment-accounts/reports/trial-balance", { params: filters.params })).data.data,
  });

  const cell = "px-4 py-2.5 text-sm";
  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "ميزان المراجعة" : "Trial Balance"} />
      <ReportShell title={isAr ? "ميزان المراجعة" : "Trial Balance"} isAr={isAr} loading={isFetching && !data} filters={filters}>
        {data && (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full">
              <thead className="bg-slate-100 text-sm font-semibold text-slate-700">
                <tr>
                  <th className={`${cell} text-start`}>{isAr ? "ميزان المراجعة" : "Trial Balance"}</th>
                  <th className={`${cell} text-end`}>{isAr ? "مدين" : "Debit"}</th>
                  <th className={`${cell} text-end`}>{isAr ? "دائن" : "Credit"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <th className={`${cell} text-start font-semibold text-slate-700`}>{isAr ? "مستحقات المورد" : "Supplier Due"}:</th>
                  <td className={cell} />
                  <td className={`${cell} text-end`}>{money(data.supplierDue)}</td>
                </tr>
                <tr>
                  <th className={`${cell} text-start font-semibold text-slate-700`}>{isAr ? "مستحقات العميل" : "Customer Due"}:</th>
                  <td className={`${cell} text-end`}>{money(data.customerDue)}</td>
                  <td className={cell} />
                </tr>
                <tr>
                  <th className={`${cell} text-start font-semibold text-slate-700`}>{isAr ? "أرصدة الحسابات" : "Account Balances"}:</th>
                  <td className={cell} />
                  <td className={cell} />
                </tr>
                {data.accountBalances.map((a) => (
                  <tr key={a.id}>
                    <td className={`${cell} ps-8 text-slate-600`}>{a.name}:</td>
                    <td className={`${cell} text-end`}>{money(a.balance)}</td>
                    <td className={cell} />
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 text-sm font-semibold text-slate-800">
                <tr>
                  <th className={`${cell} text-start`}>{isAr ? "الإجمالي" : "Total"}</th>
                  <td className={`${cell} text-end`}>{money(data.totalDebit)}</td>
                  <td className={`${cell} text-end`}>{money(data.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ReportShell>
    </div>
  );
}
