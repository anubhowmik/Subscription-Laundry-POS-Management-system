import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Link2 } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { FilterField, scopeParams, useReportAppScope } from "../reports/reportShared";
import { errorMessage, usePaymentAccountOptions } from "./shared";

type Source = "SALE" | "PURCHASE" | "EXPENSE";

interface ReportRow {
  id: string;
  source: Source;
  paymentDate: string;
  paymentRefNo: string | null;
  amount: string;
  type: "SALE" | "SELL_RETURN" | "PURCHASE" | "EXPENSE";
  document: { id: string; number: string | null } | null;
  paymentAccountId: string | null;
  paymentAccount: { name: string; accountNumber: string } | null;
}

const TYPE_LABEL: Record<ReportRow["type"], { en: string; ar: string }> = {
  SALE: { en: "Sale", ar: "بيع" },
  SELL_RETURN: { en: "Sell Return", ar: "مرتجع مبيعات" },
  PURCHASE: { en: "Purchase", ar: "شراء" },
  EXPENSE: { en: "Expense", ar: "مصروف" },
};

/** Reference: Accounting > Payment Account Report (account_reports/payment_account_report.blade.php) -
 * every sale, sell-return, purchase and expense payment with the account it landed in, and Link Account. */
export default function PaymentAccountReportPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const appScope = useReportAppScope();
  const { data: accounts } = usePaymentAccountOptions({ includeClosed: true });

  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [linking, setLinking] = useState<ReportRow | null>(null);

  const params = { ...(accountId ? { accountId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(search ? { search } : {}), ...scopeParams(appScope) };
  const { data } = useQuery({
    queryKey: ["payment-accounts", "payment-account-report", params, page, limit],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<ReportRow[]>>("/payment-accounts/reports/payment-account-report", { params: { ...params, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });
  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  const activeFilterCount = [accountId, from, to].filter(Boolean).length;
  const clearAllFilters = () => {
    setAccountId("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const title = isAr ? "الفواتير المحصلة" : "Payment Account Report";
  const typeLabel = (r: ReportRow) => (isAr ? TYPE_LABEL[r.type].ar : TYPE_LABEL[r.type].en);
  const accountLabel = (r: ReportRow) => (r.paymentAccount ? `${r.paymentAccount.name} - ${r.paymentAccount.accountNumber}` : "");
  const exportColumns = [
    { key: "date", label: isAr ? "التاريخ" : "Date" },
    { key: "refNo", label: isAr ? "الرقم المرجعي لمعاملة الدفع" : "Payment Ref No." },
    { key: "document", label: isAr ? "الرقم المرجعي للفاتورة" : "Invoice No./Ref. No." },
    { key: "amount", label: isAr ? "المبلغ" : "Amount" },
    { key: "type", label: isAr ? "نوع الدفع" : "Payment Type" },
    { key: "account", label: isAr ? "الحساب" : "Account" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={title} />

      <TableContainer>
        <TableToolbar>
          <SearchInput value={search} onChange={(e) => reset(setSearch)(e.target.value)} placeholder={t("common.search")} className="max-w-xs" />
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <FilterField label={isAr ? "الحساب" : "Account"}>
              <select value={accountId} onChange={(e) => reset(setAccountId)(e.target.value)} className={cn(selectClass, "w-full")}>
                <option value="">{t("common.all")}</option>
                <option value="none">{isAr ? "لا يوجد" : "None"}</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label={isAr ? "من" : "From"}>
              <input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className={cn(inputClass, "w-full ltr-nums")} />
            </FilterField>
            <FilterField label={isAr ? "إلى" : "To"}>
              <input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} className={cn(inputClass, "w-full ltr-nums")} />
            </FilterField>
          </FiltersMenu>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect value={limit} onChange={(n) => reset(setLimit)(n)} />
            <TableExportButtons
              title={title}
              columns={exportColumns}
              getRows={async () => {
                const all = await fetchAllRows<ReportRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<ReportRow[]>>("/payment-accounts/reports/payment-account-report", { params: { ...params, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((r) => ({
                  date: new Date(r.paymentDate).toLocaleString(locale),
                  refNo: r.paymentRefNo ?? "",
                  document: r.document?.number ?? "",
                  amount: Number(r.amount),
                  type: typeLabel(r),
                  account: accountLabel(r),
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
                <Th>{isAr ? "الرقم المرجعي لمعاملة الدفع" : "Payment Ref No."}</Th>
                <Th>{isAr ? "الرقم المرجعي للفاتورة" : "Invoice No./Ref. No."}</Th>
                <Th>{isAr ? "المبلغ" : "Amount"}</Th>
                <Th>{isAr ? "نوع الدفع" : "Payment Type"}</Th>
                <Th>{isAr ? "الحساب" : "Account"}</Th>
                <Th>{t("common.actions")}</Th>
              </tr>
            </THead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={`${r.source}:${r.id}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <span className="ltr-nums">{new Date(r.paymentDate).toLocaleString(locale)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="ltr-nums">{r.paymentRefNo ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.document?.number ? (
                      r.source === "SALE" ? (
                        <Link to={`/invoices/${r.document.id}`} target="_blank" className="ltr-nums text-sky-600 hover:underline">
                          {r.document.number}
                        </Link>
                      ) : (
                        <span className="ltr-nums">{r.document.number}</span>
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span className="ltr-nums whitespace-nowrap">{formatMoney(r.amount, currency, locale)}</span>
                  </td>
                  <td className="px-4 py-3">{typeLabel(r)}</td>
                  <td className="px-4 py-3">{accountLabel(r)}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => setLinking(r)}>
                      <Link2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> {isAr ? "ربط بحساب" : "Link Account"}
                    </Button>
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

      {linking && <LinkAccountModal payment={linking} isAr={isAr} onClose={() => setLinking(null)} />}
    </div>
  );
}

function LinkAccountModal({ payment, isAr, onClose }: { payment: ReportRow; isAr: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: accounts } = usePaymentAccountOptions();
  const [paymentAccountId, setPaymentAccountId] = useState(payment.paymentAccountId ?? "");
  const [error, setError] = useState<string | null>(null);
  const effective = paymentAccountId || accounts?.[0]?.id || "";

  const mutation = useMutation({
    mutationFn: async () => api.put(`/payment-accounts/payments/${payment.id}/link`, { paymentAccountId: effective, source: payment.source }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-accounts"] });
      qc.invalidateQueries({ queryKey: ["payment-account-book"] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });

  const ref = payment.paymentRefNo ?? payment.document?.number ?? "";
  return (
    <Modal
      title={`${isAr ? "ربط بحساب" : "Link Account"} - ${payment.paymentRefNo ? (isAr ? "الرقم المرجعي لمعاملة الدفع" : "Payment Ref No.") : isAr ? "الرقم المرجعي للفاتورة" : "Invoice No./Ref. No."}: ${ref}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={() => mutation.mutate()} disabled={!effective || mutation.isPending}>
            {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "الحساب" : "Account"}:</label>
          <select value={effective} onChange={(e) => setPaymentAccountId(e.target.value)} className={selectClass}>
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}
