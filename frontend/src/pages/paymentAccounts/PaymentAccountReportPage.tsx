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
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { PageSizeSelect } from "../../components/ui/TableToolbarControls";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { errorMessage, usePaymentAccountOptions } from "./shared";

interface ReportRow {
  id: string;
  paymentDate: string;
  paymentRefNo: string | null;
  amount: string;
  type: "SALE_PAYMENT" | "REFUND";
  paymentAccountId: string | null;
  sale: { id: string; invoiceNumber: string | null } | null;
  paymentAccount: { name: string; accountNumber: string } | null;
}

export default function PaymentAccountReportPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const { data: accounts } = usePaymentAccountOptions({ includeClosed: true });

  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [linking, setLinking] = useState<ReportRow | null>(null);

  const params = { ...(accountId ? { accountId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(search ? { search } : {}) };
  const { data } = useQuery({
    queryKey: ["payment-accounts", "payment-account-report", params, page, limit],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<ReportRow[]>>("/payment-accounts/reports/payment-account-report", { params: { ...params, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير حسابات الدفع" : "Payment Account Report"} />

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{isAr ? "عوامل التصفية" : "Filters"}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelClass}>{isAr ? "الحساب" : "Account"}:</label>
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setPage(1);
              }}
              className={selectClass}
            >
              <option value="">{t("common.all")}</option>
              <option value="none">{isAr ? "لا يوجد" : "None"}</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:col-span-2">
            <div>
              <label className={labelClass}>{isAr ? "من" : "From"}</label>
              <input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} className={cn(inputClass, "ltr-nums")} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "إلى" : "To"}</label>
              <input type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} className={cn(inputClass, "ltr-nums")} />
            </div>
          </div>
        </div>
      </Card>

      <TableContainer>
        <TableToolbar>
          <div className="w-64">
            <SearchInput value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder={t("common.search")} />
          </div>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect value={limit} onChange={(n) => (setLimit(n), setPage(1))} />
          </div>
        </TableToolbar>
        <TableScroll>
          <Table>
            <THead>
              <tr>
                <Th>{isAr ? "التاريخ" : "Date"}</Th>
                <Th>{isAr ? "رقم مرجع الدفع" : "Payment Ref No."}</Th>
                <Th>{isAr ? "رقم الفاتورة / المرجع" : "Invoice No./Ref. No."}</Th>
                <Th>{isAr ? "المبلغ" : "Amount"}</Th>
                <Th>{isAr ? "نوع الدفع" : "Payment Type"}</Th>
                <Th>{isAr ? "الحساب" : "Account"}</Th>
                <Th>{t("common.actions")}</Th>
              </tr>
            </THead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <span className="ltr-nums">{new Date(r.paymentDate).toLocaleString(locale)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="ltr-nums">{r.paymentRefNo ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.sale ? (
                      <Link to={`/invoices/${r.sale.id}`} target="_blank" className="ltr-nums text-sky-600 hover:underline">
                        {r.sale.invoiceNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span className="ltr-nums whitespace-nowrap">{formatMoney(r.amount, currency, locale)}</span>
                  </td>
                  <td className="px-4 py-3">{r.type === "REFUND" ? (isAr ? "مرتجع مبيعات" : "Sell Return") : isAr ? "بيع" : "Sale"}</td>
                  <td className="px-4 py-3">{r.paymentAccount ? `${r.paymentAccount.name} - ${r.paymentAccount.accountNumber}` : ""}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => setLinking(r)}>
                      <Link2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> {isAr ? "ربط الحساب" : "Link Account"}
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
    mutationFn: async () => api.put(`/payment-accounts/payments/${payment.id}/link`, { paymentAccountId: effective }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-accounts"] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });

  return (
    <Modal
      title={`${isAr ? "ربط الحساب" : "Link Account"} - ${isAr ? "رقم مرجع الدفع" : "Payment Ref No."}: ${payment.paymentRefNo ?? ""}`}
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
