import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, Customer, PaginationMeta } from "../../types/api";
import { formatMoney, formatDate } from "../../lib/format";
import { cn } from "../../lib/cn";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { usePriceLists } from "../../api/posApi";
import { fetchAllRows } from "../../lib/tableExport";
import { roundMoney } from "../../stores/posStore";
import { useAuth } from "../../contexts/AuthContext";
import { confirmAction } from "../../stores/confirmStore";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { SearchInput } from "../../components/ui/SearchInput";
import { labelClass, inputClass, inputSmClass, selectClass } from "../../components/ui/formClasses";
import { CustomerFormModal } from "../../components/customers/CustomerFormModal";
import {
  Users,
  Plus,
  Banknote,
  Pencil,
  Power,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

interface ContactCustomFieldLabels {
  contactCustomField1Label: string | null;
  contactCustomField2Label: string | null;
  contactCustomField3Label: string | null;
  contactCustomField4Label: string | null;
  contactCustomField5Label: string | null;
  contactCustomField6Label: string | null;
  contactCustomField7Label: string | null;
  contactCustomField8Label: string | null;
  contactCustomField9Label: string | null;
  contactCustomField10Label: string | null;
}

function useCustomFieldLabels(isAr: boolean) {
  const { data } = useQuery({
    queryKey: ["contact-custom-field-labels"],
    queryFn: async () => (await api.get<ApiSuccess<ContactCustomFieldLabels>>("/organizations/custom-field-labels")).data.data,
  });
  return Array.from({ length: 10 }, (_, i) => {
    const key = `contactCustomField${i + 1}Label` as keyof ContactCustomFieldLabels;
    return data?.[key] || (isAr ? `حقل مخصص ${i + 1}` : `Custom Field ${i + 1}`);
  });
}

interface CustomerGroupOption {
  id: string;
  nameEn: string;
  nameAr: string | null;
}

function useCustomerGroups() {
  return useQuery({
    queryKey: ["customer-groups", "all"],
    queryFn: async () => (await api.get<ApiSuccess<CustomerGroupOption[]>>("/customer-groups", { params: { limit: 100 } })).data.data,
  });
}

export default function CustomersPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [status, setStatus] = useState<"" | "ACTIVE" | "INACTIVE">("");
  // Matching the EJADA reference's Customers filters exactly (ContactController::indexCustomer()):
  // Sell Due/Sell Return/Advance Balance/Opening Balance checkboxes, Customer Group/Approval
  // Status/"Has No Sell From" dropdowns - see customer.service.ts's list().
  const [customerGroupFilter, setCustomerGroupFilter] = useState("");
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<"" | "PENDING" | "APPROVED" | "REJECTED">("");
  const [hasNoSellFrom, setHasNoSellFrom] = useState<"" | "one_month" | "three_months" | "six_months" | "one_year">("");
  const [hasSellDue, setHasSellDue] = useState(false);
  const [hasSellReturn, setHasSellReturn] = useState(false);
  const [hasAdvanceBalance, setHasAdvanceBalance] = useState(false);
  const [hasOpeningBalance, setHasOpeningBalance] = useState(false);
  const activeFilterCount =
    (status ? 1 : 0) +
    (customerGroupFilter ? 1 : 0) +
    (approvalStatusFilter ? 1 : 0) +
    (hasNoSellFrom ? 1 : 0) +
    (hasSellDue ? 1 : 0) +
    (hasSellReturn ? 1 : 0) +
    (hasAdvanceBalance ? 1 : 0) +
    (hasOpeningBalance ? 1 : 0);
  function clearAllFilters() {
    setStatus("");
    setCustomerGroupFilter("");
    setApprovalStatusFilter("");
    setHasNoSellFrom("");
    setHasSellDue(false);
    setHasSellReturn(false);
    setHasAdvanceBalance(false);
    setHasOpeningBalance(false);
    setPage(1);
  }
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const customFieldLabels = useCustomFieldLabels(isAr);
  const { data: customerGroups } = useCustomerGroups();
  const { data: priceLists } = usePriceLists();

  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  const [adjustingCustomer, setAdjustingCustomer] = useState<Customer | null>(null);
  const [adjustingCashbackCustomer, setAdjustingCashbackCustomer] = useState<Customer | null>(null);
  const [applyCreditCustomer, setApplyCreditCustomer] = useState<Customer | null>(null);

  const assignPriceListMutation = useMutation({
    mutationFn: async ({ id, priceListId }: { id: string; priceListId: string | null }) =>
      api.put(`/customers/${id}`, { priceListId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  const approvalMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) =>
      api.put(`/customers/${id}/approve`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  const columns: { key: string; label: string; sortField?: string; render: (c: Customer) => ReactNode; exportValue: (c: Customer) => string | number | null }[] = [
    { key: "code", label: isAr ? "رقم جهة الاتصال" : "Contact ID", render: (c) => <span className="ltr-nums">{c.code}</span>, exportValue: (c) => c.code },
    { key: "businessName", label: isAr ? "اسم النشاط" : "Business Name", render: (c) => c.businessName ?? "-", exportValue: (c) => c.businessName },
    {
      key: "nameEn",
      label: isAr ? "الاسم" : "Name",
      sortField: "nameEn",
      render: (c) => (isAr ? c.nameAr || c.nameEn : c.nameEn),
      exportValue: (c) => (isAr ? c.nameAr || c.nameEn : c.nameEn),
    },
    { key: "phone", label: isAr ? "الجوال" : "Mobile", render: (c) => <span className="ltr-nums">{c.phone}</span>, exportValue: (c) => c.phone },
    { key: "email", label: t("common.email"), render: (c) => c.email ?? "-", exportValue: (c) => c.email },
    {
      key: "customerGroup",
      label: t("customers.group"),
      render: (c) => (c.customerGroup ? (isAr ? c.customerGroup.nameAr : c.customerGroup.nameEn) : "-"),
      exportValue: (c) => (c.customerGroup ? (isAr ? c.customerGroup.nameAr : c.customerGroup.nameEn) : null),
    },
    {
      key: "priceList",
      label: isAr ? "قائمة الأسعار" : "Price List",
      render: (c) => (
        <select
          value={c.priceListId ?? ""}
          onChange={(e) => assignPriceListMutation.mutate({ id: c.id, priceListId: e.target.value || null })}
          className={inputSmClass}
        >
          <option value="">{isAr ? "بلا" : "None"}</option>
          {priceLists?.map((pl) => (
            <option key={pl.id} value={pl.id}>
              {isAr ? pl.nameAr || pl.nameEn : pl.nameEn}
            </option>
          ))}
        </select>
      ),
      exportValue: (c) => {
        const pl = priceLists?.find((p) => p.id === c.priceListId);
        return pl ? (isAr ? pl.nameAr || pl.nameEn : pl.nameEn) : null;
      },
    },
    { key: "vatNumber", label: isAr ? "الرقم الضريبي" : "Tax number", render: (c) => <span className="ltr-nums">{c.vatNumber ?? "-"}</span>, exportValue: (c) => c.vatNumber },
    {
      key: "address",
      label: isAr ? "العنوان" : "Address",
      render: (c) => [c.address, c.city, c.district].filter(Boolean).join(", ") || "-",
      exportValue: (c) => [c.address, c.city, c.district].filter(Boolean).join(", "),
    },
    {
      key: "paymentTermsDays",
      label: isAr ? "شرط الدفع" : "Pay term",
      render: (c) => (
        <>
          <span className="ltr-nums">{c.paymentTermsDays}</span> {isAr ? "يوم" : "days"}
        </>
      ),
      exportValue: (c) => c.paymentTermsDays,
    },
    { key: "creditLimit", label: isAr ? "حد الائتمان" : "Credit Limit", render: (c) => <span className="ltr-nums">{formatMoney(c.creditLimit, currency, locale)}</span>, exportValue: (c) => Number(c.creditLimit) },
    { key: "openingBalance", label: isAr ? "الرصيد الافتتاحي" : "Opening Balance", render: (c) => <span className="ltr-nums">{formatMoney(c.openingBalance, currency, locale)}</span>, exportValue: (c) => Number(c.openingBalance) },
    {
      key: "balance",
      label: t("customers.balance"),
      sortField: "balance",
      render: (c) => <span className="ltr-nums">{formatMoney(c.balance, currency, locale)}</span>,
      exportValue: (c) => Number(c.balance),
    },
    {
      key: "totalSaleDue",
      label: isAr ? "مستحق البيع" : "Sell Due",
      render: (c) => <span className="ltr-nums">{formatMoney(c.totalSaleDue ?? 0, currency, locale)}</span>,
      exportValue: (c) => c.totalSaleDue ?? 0,
    },
    {
      key: "totalSellReturnDue",
      label: isAr ? "مرتجع البيع المستحق" : "Sell Return Due",
      render: (c) => <span className="ltr-nums">{formatMoney(c.totalSellReturnDue ?? 0, currency, locale)}</span>,
      exportValue: (c) => c.totalSellReturnDue ?? 0,
    },
    {
      key: "rewardPoints",
      label: isAr ? "النقاط" : "Points",
      render: (c) => (
        <button onClick={() => setAdjustingCustomer(c)} className="ltr-nums rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-200">
          {c.rewardPoints}
        </button>
      ),
      exportValue: (c) => c.rewardPoints,
    },
    {
      key: "cashBack",
      label: isAr ? "الكاش باك" : "Cashback",
      render: (c) => (
        <button onClick={() => setAdjustingCashbackCustomer(c)} className="ltr-nums rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-200">
          {formatMoney(c.cashBack, currency, locale)}
        </button>
      ),
      exportValue: (c) => Number(c.cashBack),
    },
    {
      key: "createdAt",
      label: isAr ? "أضيف في" : "Added On",
      sortField: "createdAt",
      render: (c) => <span className="ltr-nums">{formatDate(c.createdAt, locale)}</span>,
      exportValue: (c) => formatDate(c.createdAt, locale),
    },
    {
      key: "status",
      label: t("common.status"),
      render: (c) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={c.status === "ACTIVE" ? "success" : "neutral"}>{c.status === "ACTIVE" ? t("common.active") : t("common.inactive")}</Badge>
          {c.approvalStatus !== "APPROVED" && (
            <Badge variant={c.approvalStatus === "PENDING" ? "warning" : "danger"}>
              {c.approvalStatus === "PENDING" ? (isAr ? "بانتظار الموافقة" : "Pending approval") : isAr ? "مرفوض" : "Rejected"}
            </Badge>
          )}
        </div>
      ),
      exportValue: (c) => (c.status === "ACTIVE" ? t("common.active") : t("common.inactive")),
    },
    ...Array.from({ length: 10 }, (_, i) => {
      const fieldKey = `customField${i + 1}` as keyof Customer;
      return {
        key: fieldKey,
        label: customFieldLabels[i],
        render: (c: Customer) => (c[fieldKey] as string | null) ?? "-",
        exportValue: (c: Customer) => c[fieldKey] as string | null,
      };
    }),
  ];

  const columnVisibility = useColumnVisibility(
    "customers",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    search,
    sortBy,
    sortOrder,
    ...(status ? { status } : {}),
    ...(customerGroupFilter ? { customerGroupId: customerGroupFilter } : {}),
    ...(approvalStatusFilter ? { approvalStatus: approvalStatusFilter } : {}),
    ...(hasNoSellFrom ? { hasNoSellFrom } : {}),
    ...(hasSellDue ? { hasSellDue: "true" } : {}),
    ...(hasSellReturn ? { hasSellReturn: "true" } : {}),
    ...(hasAdvanceBalance ? { hasAdvanceBalance: "true" } : {}),
    ...(hasOpeningBalance ? { hasOpeningBalance: "true" } : {}),
  };

  const { data } = useQuery({
    queryKey: ["customers", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Customer[]>>("/customers", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => api.put(`/customers/${id}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("customers.title")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> {t("customers.addCustomer")}
          </Button>
        }
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Users}
            cardBg="bg-app-users-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={t("customers.title")}
            value={String(data.meta.total)}
          />
        </div>
      )}

      <TableContainer>
        <TableToolbar>
          <SearchInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("common.search")}
            className="max-w-xs"
          />
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("common.status")}</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as "" | "ACTIVE" | "INACTIVE");
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                <option value="ACTIVE">{t("common.active")}</option>
                <option value="INACTIVE">{t("common.inactive")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("customers.group")}</label>
              <select
                value={customerGroupFilter}
                onChange={(e) => {
                  setCustomerGroupFilter(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {customerGroups?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {isAr ? g.nameAr || g.nameEn : g.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "حالة الاعتماد" : "Approval Status"}</label>
              <select
                value={approvalStatusFilter}
                onChange={(e) => {
                  setApprovalStatusFilter(e.target.value as "" | "PENDING" | "APPROVED" | "REJECTED");
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                <option value="PENDING">{isAr ? "بانتظار الموافقة" : "Pending"}</option>
                <option value="APPROVED">{isAr ? "معتمد" : "Approved"}</option>
                <option value="REJECTED">{isAr ? "مرفوض" : "Rejected"}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "لا يوجد بيع منذ" : "No Sell From"}</label>
              <select
                value={hasNoSellFrom}
                onChange={(e) => {
                  setHasNoSellFrom(e.target.value as typeof hasNoSellFrom);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "غير محدد" : "Not set"}</option>
                <option value="one_month">{isAr ? "شهر" : "1 month"}</option>
                <option value="three_months">{isAr ? "3 أشهر" : "3 months"}</option>
                <option value="six_months">{isAr ? "6 أشهر" : "6 months"}</option>
                <option value="one_year">{isAr ? "سنة" : "1 year"}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 border-t border-slate-100 pt-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={hasSellDue}
                  onChange={(e) => {
                    setHasSellDue(e.target.checked);
                    setPage(1);
                  }}
                />
                {isAr ? "مستحق البيع" : "Sell Due"}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={hasSellReturn}
                  onChange={(e) => {
                    setHasSellReturn(e.target.checked);
                    setPage(1);
                  }}
                />
                {isAr ? "مرتجع البيع" : "Sell Return"}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={hasAdvanceBalance}
                  onChange={(e) => {
                    setHasAdvanceBalance(e.target.checked);
                    setPage(1);
                  }}
                />
                {isAr ? "رصيد مقدم" : "Advance Balance"}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={hasOpeningBalance}
                  onChange={(e) => {
                    setHasOpeningBalance(e.target.checked);
                    setPage(1);
                  }}
                />
                {isAr ? "الرصيد الافتتاحي" : "Opening Balance"}
              </label>
            </div>
          </FiltersMenu>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect
              value={limit}
              onChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
            />
            <ColumnVisibilityMenu
              columns={columns.map((c) => ({ key: c.key, label: c.label }))}
              isVisible={columnVisibility.isVisible}
              onToggle={columnVisibility.toggle}
              isAr={isAr}
            />
            <TableExportButtons
              title={t("customers.title")}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<Customer>(async (p, l) => {
                  const res = await api.get<ApiSuccess<Customer[]>>("/customers", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((c) => Object.fromEntries(visibleColumns.map((col) => [col.key, col.exportValue(c)])));
              }}
              isAr={isAr}
            />
          </div>
        </TableToolbar>
        <TableScroll>
        <Table>
          <THead>
            <tr>
              <Th>{t("common.actions")}</Th>
              {visibleColumns.map((c) =>
                c.sortField ? (
                  <SortableTh key={c.key} field={c.sortField} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                    {c.label}
                  </SortableTh>
                ) : (
                  <Th key={c.key}>{c.label}</Th>
                ),
              )}
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <RowActions align="start">
                    <RowActionButton
                      icon={Pencil}
                      label={t("common.edit")}
                      onClick={() => {
                        setEditing(c);
                        setFormOpen(true);
                      }}
                    />
                    {c.status === "ACTIVE" ? (
                      <RowActionButton
                        icon={Power}
                        label={isAr ? "تعطيل" : "Deactivate"}
                        variant="danger"
                        onClick={async () => {
                          if (await confirmAction({ message: isAr ? `تعطيل "${c.nameEn}"؟` : `Deactivate "${c.nameEn}"?`, danger: true })) {
                            deactivateMutation.mutate(c.id);
                          }
                        }}
                      />
                    ) : (
                      <RowActionButton icon={Power} label={isAr ? "تفعيل" : "Activate"} onClick={() => activateMutation.mutate(c.id)} />
                    )}
                    {Number(c.balance) < 0 && (
                      <RowActionButton
                        icon={Banknote}
                        label={isAr ? "تطبيق الرصيد" : "Apply Credit"}
                        variant="success"
                        onClick={() => setApplyCreditCustomer(c)}
                      />
                    )}
                    {c.approvalStatus === "PENDING" && can("customers.approve") && (
                      <>
                        <RowActionButton
                          icon={CheckCircle2}
                          label={isAr ? "موافقة" : "Approve"}
                          variant="success"
                          onClick={() => approvalMutation.mutate({ id: c.id, status: "APPROVED" })}
                        />
                        <RowActionButton
                          icon={XCircle}
                          label={isAr ? "رفض" : "Reject"}
                          variant="danger"
                          onClick={() => approvalMutation.mutate({ id: c.id, status: "REJECTED" })}
                        />
                      </>
                    )}
                  </RowActions>
                </td>
                {visibleColumns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    {col.render(c)}
                  </td>
                ))}
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-400">
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

      {formOpen && (
        <CustomerFormModal
          isAr={isAr}
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => setFormOpen(false)}
        />
      )}

      {adjustingCustomer && (
        <AdjustPointsModal
          isAr={isAr}
          customer={adjustingCustomer}
          onClose={() => setAdjustingCustomer(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            setAdjustingCustomer(null);
          }}
        />
      )}

      {adjustingCashbackCustomer && (
        <AdjustCashbackModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          customer={adjustingCashbackCustomer}
          onClose={() => setAdjustingCashbackCustomer(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            setAdjustingCashbackCustomer(null);
          }}
        />
      )}

      {applyCreditCustomer && (
        <ApplyCreditModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          customer={applyCreditCustomer}
          onClose={() => setApplyCreditCustomer(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            setApplyCreditCustomer(null);
          }}
        />
      )}
    </div>
  );
}

interface DueSale {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  totalAmount: string;
  dueAmount: string;
  paymentStatus: "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
}

function ApplyCreditModal({
  isAr,
  currency,
  locale,
  customer,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const availableCredit = Number(customer.balance) < 0 ? -Number(customer.balance) : 0;
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["customer-profile", customer.id],
    queryFn: async () => (await api.get<ApiSuccess<{ sales: DueSale[] }>>(`/customers/${customer.id}/profile`)).data.data,
  });

  const dueSales = (profile?.sales ?? [])
    .filter((s) => Number(s.dueAmount) > 0)
    .sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());

  const totalEntered = Object.values(amounts).reduce((sum, v) => sum + (Number(v) || 0), 0);

  function autoApplyOldestFirst() {
    // Rounded at each step (not just at display) - remaining accumulates via repeated
    // subtraction across sales, which can drift in raw float even though every input here is
    // already a clean 2-decimal amount. Same class of bug as the POS payment auto-fill.
    let remaining = roundMoney(availableCredit);
    const next: Record<string, string> = {};
    for (const sale of dueSales) {
      if (remaining <= 0) break;
      const amount = roundMoney(Math.min(remaining, Number(sale.dueAmount)));
      next[sale.id] = amount.toFixed(2);
      remaining = roundMoney(remaining - amount);
    }
    setAmounts(next);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const entries = Object.entries(amounts).filter(([, v]) => Number(v) > 0);
      for (const [saleId, amount] of entries) {
        await api.post(`/customers/${customer.id}/apply-credit`, { saleId, amount: Number(amount) });
      }
      onSaved();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={isAr ? "تطبيق الرصيد" : "Apply Store Credit"}
      subtitle={
        <>
          {isAr ? customer.nameAr || customer.nameEn : customer.nameEn} · {isAr ? "الرصيد المتاح" : "Available"}:{" "}
          <span className="ltr-nums">{formatMoney(availableCredit, currency, locale)}</span>
        </>
      }
      onClose={onClose}
      size="lg"
    >
      <Button
        size="sm"
        variant="outline"
        className="mb-3 border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-200"
        onClick={autoApplyOldestFirst}
        disabled={dueSales.length === 0}
      >
        {isAr ? "تطبيق تلقائي (الأقدم أولاً)" : "Auto-apply oldest first"}
      </Button>

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {dueSales.map((sale) => (
          <div key={sale.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
            <div className="min-w-0">
              <p className="ltr-nums truncate text-sm font-medium text-slate-700">{sale.invoiceNumber}</p>
              <p className="text-xs text-slate-400">
                {isAr ? "المستحق" : "Due"}: <span className="ltr-nums">{formatMoney(sale.dueAmount, currency, locale)}</span>
              </p>
            </div>
            <input
              type="number"
              min={0}
              max={Number(sale.dueAmount)}
              value={amounts[sale.id] ?? ""}
              onChange={(e) => setAmounts((prev) => ({ ...prev, [sale.id]: e.target.value }))}
              placeholder="0.00"
              className={cn(inputSmClass, "w-28 ltr-nums")}
            />
          </div>
        ))}
        {dueSales.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{isAr ? "لا توجد فواتير مستحقة" : "No outstanding invoices"}</p>}
      </div>

      <div className="mt-3 flex justify-between text-sm">
        <span className="text-slate-500">{isAr ? "الإجمالي المطبق" : "Total to apply"}</span>
        <span className={cn("ltr-nums font-semibold", totalEntered > availableCredit ? "text-red-600" : "text-slate-800")}>
          {formatMoney(totalEntered, currency, locale)}
        </span>
      </div>

      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

      <Button
        fullWidth
        className="mt-4"
        onClick={submit}
        disabled={submitting || totalEntered <= 0 || totalEntered > availableCredit}
      >
        {submitting ? "…" : isAr ? "تطبيق" : "Apply"}
      </Button>
    </Modal>
  );
}

function AdjustPointsModal({
  isAr,
  customer,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => api.post(`/loyalty/customers/${customer.id}/adjust`, { points: Number(points), note }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Number(points) !== 0 && Number.isInteger(Number(points)) && note.trim().length > 0;

  return (
    <Modal
      title={isAr ? "تعديل النقاط" : "Adjust Points"}
      subtitle={
        <>
          {isAr ? customer.nameAr || customer.nameEn : customer.nameEn} · {isAr ? "الرصيد الحالي" : "Current balance"}:{" "}
          <span className="ltr-nums">{customer.rewardPoints}</span>
        </>
      }
      onClose={onClose}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "التغيير (+/-)" : "Change (+/-)"}</label>
          <input type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="-50" className={inputClass} autoFocus />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "السبب" : "Reason"}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={isAr ? "تصحيح، مكافأة ولاء..." : "Correction, goodwill bonus..."} className={inputClass} />
        </div>
      </div>
      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
      <Button
        fullWidth
        className="mt-4"
        onClick={() => {
          setError(null);
          mutation.mutate();
        }}
        disabled={!canSubmit || mutation.isPending}
      >
        {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
      </Button>
    </Modal>
  );
}

function AdjustCashbackModal({
  isAr,
  currency,
  locale,
  customer,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => api.post(`/cashback/customers/${customer.id}/adjust`, { amount: Number(amount), note }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Number(amount) !== 0 && note.trim().length > 0;

  return (
    <Modal
      title={isAr ? "تعديل الكاش باك" : "Adjust Cashback"}
      subtitle={
        <>
          {isAr ? customer.nameAr || customer.nameEn : customer.nameEn} · {isAr ? "الرصيد الحالي" : "Current balance"}:{" "}
          <span className="ltr-nums">{formatMoney(customer.cashBack, currency, locale)}</span>
        </>
      }
      onClose={onClose}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "التغيير (+/-)" : "Change (+/-)"}</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-25.00" className={inputClass} autoFocus />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "السبب" : "Reason"}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={isAr ? "تصحيح، مكافأة..." : "Correction, goodwill grant..."} className={inputClass} />
        </div>
      </div>
      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
      <Button
        fullWidth
        className="mt-4"
        onClick={() => {
          setError(null);
          mutation.mutate();
        }}
        disabled={!canSubmit || mutation.isPending}
      >
        {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
      </Button>
    </Modal>
  );
}
