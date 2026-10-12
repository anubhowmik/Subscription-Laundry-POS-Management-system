import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { usePaymentMethods } from "../../api/posApi";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { inputClass, selectClass } from "../../components/ui/formClasses";
import { FilterField, scopeParams, useReportAppScope } from "../reports/reportShared";
import { AccountingCustomerFilter, todayValue, useAccountingFilterOptions, usePaymentAccountOptions } from "./shared";

interface SellPaymentRow {
  id: string;
  paymentRefNo: string | null;
  paymentDate: string;
  amount: string;
  signedAmount: string;
  type: "SALE_PAYMENT" | "REFUND";
  referenceNumber: string | null;
  notes: string | null;
  paymentAccount: { name: string } | null;
  paymentMethod: { nameEn: string; nameAr: string; code: string };
  customer: { id: string; nameEn: string; nameAr: string | null; code: string; customerGroup: { nameEn: string; nameAr: string } | null };
  sale: { id: string; invoiceNumber: string | null } | null;
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string };
}

type SellPaymentsMeta = PaginationMeta & { totals: { amount: string } };

export default function SellPaymentsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation, locations } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const appScope = useReportAppScope();
  const [customer, setCustomer] = useState<{ id: string; label: string } | null>(null);
  const [businessLocationId, setBusinessLocationId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [customerGroupId, setCustomerGroupId] = useState("");
  // Reference: the report opens on today's payments.
  const [from, setFrom] = useState(todayValue());
  const [to, setTo] = useState(todayValue());
  const [accountId, setAccountId] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [viewing, setViewing] = useState<SellPaymentRow | null>(null);

  const { data: paymentMethods } = usePaymentMethods();
  const { data: accounts } = usePaymentAccountOptions({ includeClosed: true });
  const { data: filterOptions } = useAccountingFilterOptions();
  const customerGroups = filterOptions?.customerGroups;
  const users = filterOptions?.users;

  const filterParams = {
    ...(customer ? { customerId: customer.id } : {}),
    ...(businessLocationId ? { businessLocationId } : {}),
    ...(paymentMethodId ? { paymentMethodId } : {}),
    ...(customerGroupId ? { customerGroupId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(accountId ? { accountId } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...scopeParams(appScope),
  };
  const { data } = useQuery({
    queryKey: ["payment-accounts", "sell-payments", filterParams, page, limit],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<SellPaymentRow[]>>("/payment-accounts/sell-payments", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as SellPaymentsMeta };
    },
  });
  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  // Reference: the report opens on today's payments, so "today" is the resting state, not a filter.
  const today = todayValue();
  const activeFilterCount =
    (customer ? 1 : 0) +
    (businessLocationId ? 1 : 0) +
    (paymentMethodId ? 1 : 0) +
    (customerGroupId ? 1 : 0) +
    (from !== today ? 1 : 0) +
    (to !== today ? 1 : 0) +
    (accountId ? 1 : 0) +
    (createdBy ? 1 : 0);
  const clearAllFilters = () => {
    setCustomer(null);
    setBusinessLocationId("");
    setPaymentMethodId("");
    setCustomerGroupId("");
    setFrom(today);
    setTo(today);
    setAccountId("");
    setCreatedBy("");
    setPage(1);
  };

  const methodLabel = (r: SellPaymentRow) => (isAr ? r.paymentMethod.nameAr || r.paymentMethod.nameEn : r.paymentMethod.nameEn);
  const groupLabel = (r: SellPaymentRow) => (r.customer.customerGroup ? (isAr ? r.customer.customerGroup.nameAr || r.customer.customerGroup.nameEn : r.customer.customerGroup.nameEn) : "");
  const exportColumns = [
    { key: "refNo", label: isAr ? "الرقم المرجعي" : "Ref No." },
    { key: "paidOn", label: isAr ? "تاريخ الدفع" : "Paid on" },
    { key: "amount", label: isAr ? "المبلغ" : "Amount" },
    { key: "account", label: isAr ? "الحساب" : "Account" },
    { key: "customer", label: isAr ? "العميل" : "Customer" },
    { key: "group", label: isAr ? "مجموعة العملاء" : "Customer Group" },
    { key: "method", label: isAr ? "طريقة الدفع" : "Payment Method" },
    { key: "sale", label: isAr ? "البيع" : "Sale" },
    { key: "createdBy", label: isAr ? "أنشئ بواسطة" : "Created By" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير مدفوعات المبيعات" : "Sell Payment Report"} />

      <TableContainer>
        <TableToolbar>
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <FilterField label={isAr ? "العميل" : "Customer"}>
              <AccountingCustomerFilter value={customer} onChange={reset(setCustomer)} isAr={isAr} />
            </FilterField>
            <FilterField label={isAr ? "موقع العمل" : "Business Location"}>
              <select value={businessLocationId} onChange={(e) => reset(setBusinessLocationId)(e.target.value)} className={cn(selectClass, "w-full")}>
                <option value="">{t("common.all")}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.branchName}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label={isAr ? "طريقة الدفع" : "Payment Method"}>
              <select value={paymentMethodId} onChange={(e) => reset(setPaymentMethodId)(e.target.value)} className={cn(selectClass, "w-full")}>
                <option value="">{t("common.all")}</option>
                {(paymentMethods ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {isAr ? m.nameAr || m.nameEn : m.nameEn}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label={isAr ? "مجموعة العملاء" : "Customer Group"}>
              <select value={customerGroupId} onChange={(e) => reset(setCustomerGroupId)(e.target.value)} className={cn(selectClass, "w-full")}>
                <option value="">{t("common.all")}</option>
                {(customerGroups ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {isAr ? g.nameAr || g.nameEn : g.nameEn}
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
            <FilterField label={isAr ? "الحساب" : "Account"}>
              <select value={accountId} onChange={(e) => reset(setAccountId)(e.target.value)} className={cn(selectClass, "w-full")}>
                <option value="">{t("common.all")}</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label={isAr ? "موظف الخدمة" : "Service Staff"}>
              <select value={createdBy} onChange={(e) => reset(setCreatedBy)(e.target.value)} className={cn(selectClass, "w-full")}>
                <option value="">{t("common.all")}</option>
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullNameEn}
                  </option>
                ))}
              </select>
            </FilterField>
          </FiltersMenu>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect value={limit} onChange={(n) => reset(setLimit)(n)} />
            <TableExportButtons
              title={isAr ? "تقرير مدفوعات المبيعات" : "Sell Payment Report"}
              columns={exportColumns}
              getRows={async () => {
                const all = await fetchAllRows<SellPaymentRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<SellPaymentRow[]>>("/payment-accounts/sell-payments", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((r) => ({
                  refNo: r.paymentRefNo,
                  paidOn: new Date(r.paymentDate).toLocaleString(locale),
                  amount: Number(r.signedAmount),
                  account: r.paymentAccount?.name ?? "--",
                  customer: r.customer.nameEn,
                  group: groupLabel(r),
                  method: methodLabel(r),
                  sale: r.sale?.invoiceNumber ?? "",
                  createdBy: r.createdByUser.fullNameEn,
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
                <Th>{isAr ? "الرقم المرجعي" : "Ref No."}</Th>
                <Th>{isAr ? "تاريخ الدفع" : "Paid on"}</Th>
                <Th>{isAr ? "المبلغ" : "Amount"}</Th>
                <Th>{isAr ? "الحساب" : "Account"}</Th>
                <Th>{isAr ? "العميل" : "Customer"}</Th>
                <Th>{isAr ? "مجموعة العملاء" : "Customer Group"}</Th>
                <Th>{isAr ? "طريقة الدفع" : "Payment Method"}</Th>
                <Th>{isAr ? "البيع" : "Sale"}</Th>
                <Th>{isAr ? "أنشئ بواسطة" : "Created By"}</Th>
                <Th>{t("common.actions")}</Th>
              </tr>
            </THead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <span className="ltr-nums">{r.paymentRefNo ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <span className="ltr-nums">{new Date(r.paymentDate).toLocaleString(locale)}</span>
                  </td>
                  <td className={cn("px-4 py-3 font-medium", r.type === "REFUND" && "text-red-600")}>
                    <span className="ltr-nums whitespace-nowrap">{formatMoney(r.signedAmount, currency, locale)}</span>
                  </td>
                  <td className="px-4 py-3">{r.paymentAccount?.name ?? "--"}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{isAr ? r.customer.nameAr || r.customer.nameEn : r.customer.nameEn}</div>
                    <div className="ltr-nums text-xs text-slate-400">{r.customer.code}</div>
                  </td>
                  <td className="px-4 py-3">{groupLabel(r)}</td>
                  <td className="px-4 py-3">
                    {methodLabel(r)}
                    {r.referenceNumber && r.type !== "REFUND" && (
                      <div className="text-xs text-slate-400">
                        ({isAr ? "رقم المعاملة" : "Transaction No."}: <span className="ltr-nums">{r.referenceNumber}</span>)
                      </div>
                    )}
                    {r.type === "REFUND" && <div className="text-xs text-slate-400">({isAr ? "استرداد" : "Refund"})</div>}
                  </td>
                  <td className="px-4 py-3">
                    {r.sale ? (
                      <Link to={`/invoices/${r.sale.id}`} target="_blank" className="ltr-nums text-sky-600 hover:underline">
                        {r.sale.invoiceNumber}
                      </Link>
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.createdByUser.fullNameEn}</td>
                  <td className="px-4 py-3">
                    <RowActions align="start">
                      <RowActionButton icon={Eye} label={isAr ? "عرض" : "View"} onClick={() => setViewing(r)} />
                    </RowActions>
                  </td>
                </tr>
              ))}
              {data?.rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    {t("common.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-semibold text-slate-700">
                <td colSpan={2} className="px-4 py-3 text-center">
                  {t("common.total")}:
                </td>
                <td className="px-4 py-3">
                  <span className="ltr-nums whitespace-nowrap">{formatMoney(data?.meta.totals.amount ?? 0, currency, locale)}</span>
                </td>
                <td colSpan={7} />
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

      {viewing && (
        <Modal title={`${isAr ? "تفاصيل الدفعة" : "View Payment"} - ${viewing.paymentRefNo ?? ""}`} onClose={() => setViewing(null)} size="lg">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              [isAr ? "الرقم المرجعي" : "Reference No", viewing.paymentRefNo ?? "—"],
              [isAr ? "تاريخ الدفع" : "Paid on", new Date(viewing.paymentDate).toLocaleString(locale)],
              [isAr ? "المبلغ" : "Amount", formatMoney(viewing.signedAmount, currency, locale)],
              [isAr ? "طريقة الدفع" : "Payment Method", methodLabel(viewing)],
              [isAr ? "رقم المعاملة" : "Transaction No.", viewing.referenceNumber && viewing.type !== "REFUND" ? viewing.referenceNumber : "—"],
              [isAr ? "الحساب" : "Account", viewing.paymentAccount?.name ?? "--"],
              [isAr ? "العميل" : "Customer", `${viewing.customer.nameEn} (${viewing.customer.code})`],
              [isAr ? "البيع" : "Sale", viewing.sale?.invoiceNumber ?? "—"],
              [isAr ? "الفرع" : "Location", viewing.businessLocation.branchName],
              [isAr ? "أنشئ بواسطة" : "Created By", viewing.createdByUser.fullNameEn],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-slate-100 pb-2">
                <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                <dd className="ltr-nums mt-0.5 text-slate-800">{value}</dd>
              </div>
            ))}
            {viewing.notes && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold text-slate-500">{isAr ? "ملاحظة" : "Note"}</dt>
                <dd className="mt-0.5 text-slate-800">{viewing.notes}</dd>
              </div>
            )}
          </dl>
        </Modal>
      )}
    </div>
  );
}
