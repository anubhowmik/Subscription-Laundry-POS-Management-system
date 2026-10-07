import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Pagination } from "../../components/ui/Pagination";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { MovementDescriptionCell, usePaymentAccountOptions, type MovementDescription } from "./shared";

interface CashFlowRow {
  id: string;
  operationDate: string;
  accountName: string;
  type: "DEBIT" | "CREDIT";
  amount: string;
  note: string | null;
  description: MovementDescription;
  accountBalance: string;
  totalBalance: string;
}

type CashFlowMeta = PaginationMeta & { totals: { debit: string; credit: string } };

export default function CashFlowPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation, locations } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const { data: accounts } = usePaymentAccountOptions({ includeClosed: true });

  const [accountId, setAccountId] = useState("");
  const [businessLocationId, setBusinessLocationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const filterParams = {
    ...(accountId ? { accountId } : {}),
    ...(businessLocationId ? { businessLocationId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(type ? { type } : {}),
  };
  const { data } = useQuery({
    queryKey: ["payment-accounts", "cash-flow", filterParams, page, limit],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<CashFlowRow[]>>("/payment-accounts/reports/cash-flow", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as CashFlowMeta };
    },
  });
  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const exportColumns = [
    { key: "date", label: isAr ? "التاريخ" : "Date" },
    { key: "account", label: isAr ? "الحساب" : "Account" },
    { key: "description", label: isAr ? "الوصف" : "Description" },
    { key: "debit", label: isAr ? "مدين" : "Debit" },
    { key: "credit", label: isAr ? "دائن" : "Credit" },
    { key: "accountBalance", label: isAr ? "رصيد الحساب" : "Account Balance" },
    { key: "totalBalance", label: isAr ? "الرصيد الإجمالي" : "Total Balance" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "التدفق النقدي" : "Cash Flow"} />

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{isAr ? "عوامل التصفية" : "Filters"}:</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelClass}>{isAr ? "الحساب" : "Account"}:</label>
            <select value={accountId} onChange={(e) => reset(setAccountId)(e.target.value)} className={selectClass}>
              <option value="">{t("common.all")}</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{isAr ? "موقع العمل" : "Business Location"}:</label>
            <select value={businessLocationId} onChange={(e) => reset(setBusinessLocationId)(e.target.value)} className={selectClass}>
              <option value="">{t("common.all")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>{isAr ? "من" : "From"}</label>
              <input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className={cn(inputClass, "ltr-nums")} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "إلى" : "To"}</label>
              <input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} className={cn(inputClass, "ltr-nums")} />
            </div>
          </div>
          <div>
            <label className={labelClass}>{isAr ? "نوع الحركة" : "Transaction Type"}:</label>
            <select value={type} onChange={(e) => reset(setType)(e.target.value)} className={selectClass}>
              <option value="">{t("common.all")}</option>
              <option value="DEBIT">{isAr ? "مدين" : "Debit"}</option>
              <option value="CREDIT">{isAr ? "دائن" : "Credit"}</option>
            </select>
          </div>
        </div>
      </Card>

      <TableContainer>
        <TableToolbar>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect value={limit} onChange={(n) => reset(setLimit)(n)} />
            <TableExportButtons
              title={isAr ? "التدفق النقدي" : "Cash Flow"}
              columns={exportColumns}
              getRows={async () => {
                const all = await fetchAllRows<CashFlowRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<CashFlowRow[]>>("/payment-accounts/reports/cash-flow", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((r) => ({
                  date: new Date(r.operationDate).toLocaleString(locale),
                  account: r.accountName,
                  description: [r.description.subType, r.description.docType, r.description.docNumber, r.description.counterAccountName].filter(Boolean).join(" "),
                  debit: r.type === "DEBIT" ? Number(r.amount) : null,
                  credit: r.type === "CREDIT" ? Number(r.amount) : null,
                  accountBalance: Number(r.accountBalance),
                  totalBalance: Number(r.totalBalance),
                }));
              }}
              isAr={isAr}
            />
          </div>
        </TableToolbar>
        <TableScroll>
          <Table>
            <THead>
              <tr>
                <Th>{isAr ? "التاريخ" : "Date"}</Th>
                <Th>{isAr ? "الحساب" : "Account"}</Th>
                <Th>{isAr ? "الوصف" : "Description"}</Th>
                <Th>{isAr ? "مدين" : "Debit"}</Th>
                <Th>{isAr ? "دائن" : "Credit"}</Th>
                <Th>
                  <span className="inline-flex items-center gap-1" title={isAr ? "رصيد الحساب بعد هذه الحركة" : "Balance of the account after this transaction"}>
                    {isAr ? "رصيد الحساب" : "Account Balance"} <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </span>
                </Th>
                <Th>
                  <span className="inline-flex items-center gap-1" title={isAr ? "مجموع أرصدة كل الحسابات بعد هذه الحركة" : "Total balance of all accounts after this transaction"}>
                    {isAr ? "الرصيد الإجمالي" : "Total Balance"} <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </span>
                </Th>
              </tr>
            </THead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <span className="ltr-nums">{new Date(r.operationDate).toLocaleString(locale)}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.accountName}</td>
                  <td className="px-4 py-3">
                    <MovementDescriptionCell d={r.description} type={r.type} isAr={isAr} />
                  </td>
                  <td className="px-4 py-3 font-medium text-red-600">{r.type === "DEBIT" && <span className="ltr-nums whitespace-nowrap">{formatMoney(r.amount, currency, locale)}</span>}</td>
                  <td className="px-4 py-3 font-medium text-emerald-700">{r.type === "CREDIT" && <span className="ltr-nums whitespace-nowrap">{formatMoney(r.amount, currency, locale)}</span>}</td>
                  <td className="px-4 py-3">
                    <span className="ltr-nums whitespace-nowrap">{formatMoney(r.accountBalance, currency, locale)}</span>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span className="ltr-nums whitespace-nowrap">{formatMoney(r.totalBalance, currency, locale)}</span>
                  </td>
                </tr>
              ))}
              {data?.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {t("common.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-semibold text-slate-700">
                <td colSpan={3} className="px-4 py-3 text-center">
                  {t("common.total")}:
                </td>
                <td className="px-4 py-3">
                  <span className="ltr-nums whitespace-nowrap">{formatMoney(data?.meta.totals.debit ?? 0, currency, locale)}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="ltr-nums whitespace-nowrap">{formatMoney(data?.meta.totals.credit ?? 0, currency, locale)}</span>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </Table>
        </TableScroll>
      </TableContainer>

      {data?.meta && data.meta.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={data.meta.totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          label={`${t("common.page")} ${page} ${t("common.of")} ${data.meta.totalPages}`}
        />
      )}
    </div>
  );
}
