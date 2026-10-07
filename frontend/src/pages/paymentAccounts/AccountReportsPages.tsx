import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Printer, CalendarDays } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useAuth } from "../../contexts/AuthContext";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { IconInput } from "../../components/ui/IconInput";
import { labelClass, selectClass } from "../../components/ui/formClasses";
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
  return { businessLocationId, setBusinessLocationId, endDate, setEndDate };
}

function ReportFilters({ isAr, filters }: { isAr: boolean; filters: ReturnType<typeof useReportFilters> }) {
  const { t } = useTranslation();
  const { locations } = useBusinessLocation();
  return (
    <Card className="p-5 print:hidden">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{isAr ? "عوامل التصفية" : "Filters"}:</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>{isAr ? "موقع العمل" : "Business Location"}:</label>
          <select value={filters.businessLocationId} onChange={(e) => filters.setBusinessLocationId(e.target.value)} className={selectClass}>
            <option value="">{t("common.all")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.branchName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{isAr ? "تصفية حسب التاريخ" : "Filter by date"}:</label>
          <IconInput icon={CalendarDays} type="date" value={filters.endDate} onChange={(e) => filters.setEndDate(e.target.value)} className="ltr-nums" />
        </div>
      </div>
    </Card>
  );
}

function ReportShell({ title, endDate, isAr, loading, children }: { title: string; endDate: string; isAr: boolean; loading: boolean; children: ReactNode }) {
  const { user } = useAuth();
  const orgName = user?.organization ? (isAr ? user.organization.nameAr || user.organization.nameEn : user.organization.nameEn) : "";
  return (
    <Card className="print-area overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-800">
          {orgName ? `${orgName} - ` : ""}
          {title} - <span className="ltr-nums">{new Date(`${endDate}T00:00:00`).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
        </h3>
      </div>
      <div className="p-5">{loading ? <Spinner /> : children}</div>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "طباعة" : "Print"}
        </Button>
      </div>
    </Card>
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
    queryKey: ["payment-accounts", "balance-sheet", filters.businessLocationId, filters.endDate],
    queryFn: async () =>
      (
        await api.get<ApiSuccess<BalanceSheetData>>("/payment-accounts/reports/balance-sheet", {
          params: { endDate: filters.endDate, ...(filters.businessLocationId ? { businessLocationId: filters.businessLocationId } : {}) },
        })
      ).data.data,
  });

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "الميزانية العمومية" : "Balance Sheet"} />
      <ReportFilters isAr={isAr} filters={filters} />
      <ReportShell title={isAr ? "الميزانية العمومية" : "Balance Sheet"} endDate={filters.endDate} isAr={isAr} loading={isFetching && !data}>
        {data && (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="border-b border-slate-200 md:border-b-0 md:border-e">
                <div className="bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">{isAr ? "الالتزامات" : "Liability"}</div>
                <table className="w-full px-4">
                  <tbody className="[&_td]:px-4 [&_th]:px-4">
                    <Row label={`${isAr ? "مستحقات الموردين" : "Supplier Due"}:`} value={money(data.supplierDue)} />
                  </tbody>
                </table>
              </div>
              <div>
                <div className="bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">{isAr ? "الأصول" : "Assets"}</div>
                <table className="w-full">
                  <tbody className="[&_td]:px-4 [&_th]:px-4">
                    <Row label={`${isAr ? "مستحقات العملاء" : "Customer Due"}:`} value={money(data.customerDue)} />
                    <Row label={`${isAr ? "مخزون آخر المدة" : "Closing Stock"}:`} value={money(data.closingStock)} />
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
                <span>{isAr ? "إجمالي الالتزامات" : "Total Liability"}:</span>
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
    queryKey: ["payment-accounts", "trial-balance", filters.businessLocationId, filters.endDate],
    queryFn: async () =>
      (
        await api.get<ApiSuccess<TrialBalanceData>>("/payment-accounts/reports/trial-balance", {
          params: { endDate: filters.endDate, ...(filters.businessLocationId ? { businessLocationId: filters.businessLocationId } : {}) },
        })
      ).data.data,
  });

  const cell = "px-4 py-2.5 text-sm";
  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "ميزان المراجعة" : "Trial Balance"} />
      <ReportFilters isAr={isAr} filters={filters} />
      <ReportShell title={isAr ? "ميزان المراجعة" : "Trial Balance"} endDate={filters.endDate} isAr={isAr} loading={isFetching && !data}>
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
                  <th className={`${cell} text-start font-semibold text-slate-700`}>{isAr ? "مستحقات الموردين" : "Supplier Due"}:</th>
                  <td className={cell} />
                  <td className={`${cell} text-end`}>{money(data.supplierDue)}</td>
                </tr>
                <tr>
                  <th className={`${cell} text-start font-semibold text-slate-700`}>{isAr ? "مستحقات العملاء" : "Customer Due"}:</th>
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
