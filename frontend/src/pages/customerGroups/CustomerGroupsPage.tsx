import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import { confirmAction } from "../../stores/confirmStore";
import type { Account, ApiSuccess, PaginationMeta } from "../../types/api";
import { usePriceLists, usePaymentMethods } from "../../api/posApi";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney, formatDate } from "../../lib/format";
import { fetchAllRows } from "../../lib/tableExport";
import { cn } from "../../lib/cn";
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
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { IconInput, IconSelect } from "../../components/ui/IconInput";
import { FormSection } from "../../components/ui/FormSection";
import {
  UsersRound,
  Percent,
  Tag,
  BookOpen,
  Banknote,
  CalendarClock,
  Briefcase,
  Building2,
  User,
  Truck,
  Receipt,
  MessageSquare,
  Pencil,
  Power,
  Hash,
  Package,
} from "lucide-react";
import type { ReactNode } from "react";

type PriceCalculationType = "PERCENTAGE" | "SELLING_PRICE_GROUP";
type CapScope = "CUSTOMER" | "COMPANY";
type GroupInvoiceType = "DELIVERY" | "FINAL";

interface CustomerGroupRow {
  id: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  discountPercent: string;
  creditLimit: string;
  paymentTermsDays: number;
  priceListId: string | null;
  maxAmountPerMonth: string | null;
  maxInvoicesPerMonth: number | null;
  maxQtyPerMonth: string | null;
  maxFor: CapScope | null;
  defaultAccountId: string | null;
  defaultAccount: { id: string; code: string; nameEn: string; nameAr: string | null } | null;
  priceCalculationType: PriceCalculationType;
  isCorporate: boolean;
  taxNumber: string | null;
  sendSms: boolean;
  priceEditable: boolean;
  invoiceType: GroupInvoiceType;
  status: "ACTIVE" | "INACTIVE";
}

export default function CustomerGroupsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerGroupRow | null>(null);
  const [payingGroup, setPayingGroup] = useState<CustomerGroupRow | null>(null);

  // Sortable column headers matching the reference's DataTable - backend already whitelists
  // these fields (customerGroup.service.ts's SORTABLE_FIELDS).
  const [sortBy, setSortBy] = useState("nameEn");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "INACTIVE">("");
  const [isCorporateFilter, setIsCorporateFilter] = useState(false);
  const [priceCalcFilter, setPriceCalcFilter] = useState<"" | PriceCalculationType>("");
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<"" | GroupInvoiceType>("");
  const activeFilterCount =
    (statusFilter ? 1 : 0) + (isCorporateFilter ? 1 : 0) + (priceCalcFilter ? 1 : 0) + (invoiceTypeFilter ? 1 : 0);
  function clearAllFilters() {
    setStatusFilter("");
    setIsCorporateFilter(false);
    setPriceCalcFilter("");
    setInvoiceTypeFilter("");
    setPage(1);
  }

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    search: search || undefined,
    sortBy,
    sortOrder,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(isCorporateFilter ? { isCorporate: "true" } : {}),
    ...(priceCalcFilter ? { priceCalculationType: priceCalcFilter } : {}),
    ...(invoiceTypeFilter ? { invoiceType: invoiceTypeFilter } : {}),
  };

  const { data } = useQuery({
    queryKey: ["customer-groups", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<CustomerGroupRow[]>>("/customer-groups", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });
  const { data: priceLists } = usePriceLists();
  const { data: accounts } = useQuery({
    queryKey: ["accounting-accounts-flat"],
    queryFn: async () => (await api.get<ApiSuccess<Account[]>>("/accounting/accounts")).data.data,
  });
  const flatAccounts = (accounts ?? []).flatMap((a) => [a, ...(a.childAccounts ?? [])]);

  const activateMutation = useMutation({
    mutationFn: async (id: string) => api.put(`/customer-groups/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer-groups"] }),
  });
  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/customer-groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer-groups"] }),
  });

  function priceListName(id: string | null) {
    if (!id) return "—";
    const pl = priceLists?.find((p) => p.id === id);
    if (!pl) return "—";
    return isAr ? pl.nameAr || pl.nameEn : pl.nameEn;
  }

  const columns: { key: string; label: string; sortField?: string; render: (g: CustomerGroupRow) => ReactNode; exportValue: (g: CustomerGroupRow) => string | number | null }[] = [
    {
      key: "name",
      label: isAr ? "الاسم" : "Name",
      sortField: "nameEn",
      render: (g) => (
        <>
          <span className="font-medium">{isAr ? g.nameAr || g.nameEn : g.nameEn}</span>
          {g.isCorporate && (
            <Badge variant="info" className="ms-1.5">
              {isAr ? "شركة" : "Corporate"}
            </Badge>
          )}
        </>
      ),
      exportValue: (g) => (isAr ? g.nameAr || g.nameEn : g.nameEn),
    },
    {
      key: "account",
      label: isAr ? "الحساب" : "Account",
      render: (g) => (g.defaultAccount ? `${g.defaultAccount.code} - ${isAr ? g.defaultAccount.nameAr || g.defaultAccount.nameEn : g.defaultAccount.nameEn}` : "—"),
      exportValue: (g) => (g.defaultAccount ? `${g.defaultAccount.code} - ${g.defaultAccount.nameEn}` : null),
    },
    {
      key: "creditLimit",
      label: isAr ? "حد الائتمان" : "Credit Limit",
      render: (g) => <span className="ltr-nums">{g.creditLimit}</span>,
      exportValue: (g) => Number(g.creditLimit),
    },
    {
      key: "pricing",
      label: isAr ? "التسعير" : "Pricing",
      render: (g) =>
        g.priceCalculationType === "PERCENTAGE" ? (
          <span className="ltr-nums">{g.discountPercent}%</span>
        ) : (
          priceListName(g.priceListId)
        ),
      exportValue: (g) => (g.priceCalculationType === "PERCENTAGE" ? `${g.discountPercent}%` : priceListName(g.priceListId)),
    },
    {
      key: "paymentTermsDays",
      label: isAr ? "شروط الدفع (يوم)" : "Payment Terms (days)",
      render: (g) => <span className="ltr-nums">{g.paymentTermsDays}</span>,
      exportValue: (g) => g.paymentTermsDays,
    },
    {
      key: "invoiceType",
      label: isAr ? "نوع الفاتورة" : "Invoice Type",
      render: (g) => (
        <Badge variant={g.invoiceType === "DELIVERY" ? "warning" : "success"}>
          {g.invoiceType === "DELIVERY" ? (isAr ? "فاتورة تسليم" : "Delivery") : isAr ? "فاتورة نهائية" : "Final"}
        </Badge>
      ),
      exportValue: (g) => (g.invoiceType === "DELIVERY" ? "Delivery" : "Final"),
    },
    {
      key: "corporate",
      label: isAr ? "شركة" : "Corporate",
      render: (g) => <Badge variant={g.isCorporate ? "info" : "neutral"}>{g.isCorporate ? t("common.yes") : t("common.no")}</Badge>,
      exportValue: (g) => (g.isCorporate ? t("common.yes") : t("common.no")),
    },
    {
      key: "taxNumber",
      label: isAr ? "الرقم الضريبي" : "Tax Number",
      render: (g) => <span className="ltr-nums">{g.taxNumber || "—"}</span>,
      exportValue: (g) => g.taxNumber,
    },
    {
      key: "monthlyCap",
      label: isAr ? "الحد الشهري" : "Monthly Cap",
      render: (g) => {
        if (!g.isCorporate || (!g.maxAmountPerMonth && !g.maxInvoicesPerMonth && !g.maxQtyPerMonth)) return "—";
        const parts = [
          g.maxAmountPerMonth ? `${isAr ? "مبلغ" : "Amount"}: ${g.maxAmountPerMonth}` : null,
          g.maxInvoicesPerMonth ? `${isAr ? "فواتير" : "Invoices"}: ${g.maxInvoicesPerMonth}` : null,
          g.maxQtyPerMonth ? `${isAr ? "كمية" : "Qty"}: ${g.maxQtyPerMonth}` : null,
        ].filter(Boolean);
        const scope = g.maxFor === "CUSTOMER" ? (isAr ? "لكل عميل" : "per customer") : isAr ? "إجمالي الشركة" : "per company";
        return `${parts.join(", ")} (${scope})`;
      },
      exportValue: (g) => {
        if (!g.isCorporate || (!g.maxAmountPerMonth && !g.maxInvoicesPerMonth && !g.maxQtyPerMonth)) return null;
        const parts = [
          g.maxAmountPerMonth ? `Amount: ${g.maxAmountPerMonth}` : null,
          g.maxInvoicesPerMonth ? `Invoices: ${g.maxInvoicesPerMonth}` : null,
          g.maxQtyPerMonth ? `Qty: ${g.maxQtyPerMonth}` : null,
        ].filter(Boolean);
        const scope = g.maxFor === "CUSTOMER" ? "per customer" : "per company";
        return `${parts.join(", ")} (${scope})`;
      },
    },
    {
      key: "sendSms",
      label: isAr ? "إرسال رسالة" : "Send SMS",
      render: (g) => <Badge variant={g.sendSms ? "success" : "neutral"}>{g.sendSms ? t("common.yes") : t("common.no")}</Badge>,
      exportValue: (g) => (g.sendSms ? t("common.yes") : t("common.no")),
    },
    {
      key: "priceEditable",
      label: isAr ? "تعديل السعر" : "Price Editable",
      render: (g) => <Badge variant={g.priceEditable ? "success" : "neutral"}>{g.priceEditable ? t("common.yes") : t("common.no")}</Badge>,
      exportValue: (g) => (g.priceEditable ? t("common.yes") : t("common.no")),
    },
    {
      key: "status",
      label: t("common.status"),
      render: (g) => <Badge variant={g.status === "ACTIVE" ? "success" : "neutral"}>{g.status === "ACTIVE" ? t("common.active") : t("common.inactive")}</Badge>,
      exportValue: (g) => (g.status === "ACTIVE" ? t("common.active") : t("common.inactive")),
    },
  ];

  const columnVisibility = useColumnVisibility(
    "customer-groups",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "مجموعات العملاء" : "Customer Groups"}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            + {isAr ? "مجموعة جديدة" : "Add Group"}
          </Button>
        }
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={UsersRound}
            cardBg="bg-sky-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "مجموعات العملاء" : "Customer Groups"}
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
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as typeof statusFilter);
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
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "نوع التسعير" : "Price Calculation"}</label>
              <select
                value={priceCalcFilter}
                onChange={(e) => {
                  setPriceCalcFilter(e.target.value as typeof priceCalcFilter);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                <option value="PERCENTAGE">{isAr ? "نسبة مئوية" : "Percentage"}</option>
                <option value="SELLING_PRICE_GROUP">{isAr ? "قائمة أسعار" : "Selling Price Group"}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "نوع الفاتورة" : "Invoice Type"}</label>
              <select
                value={invoiceTypeFilter}
                onChange={(e) => {
                  setInvoiceTypeFilter(e.target.value as typeof invoiceTypeFilter);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                <option value="DELIVERY">{isAr ? "فاتورة تسليم" : "Delivery Invoice"}</option>
                <option value="FINAL">{isAr ? "فاتورة نهائية" : "Final Invoice"}</option>
              </select>
            </div>
            <label className="flex items-center gap-1.5 border-t border-slate-100 pt-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={isCorporateFilter}
                onChange={(e) => {
                  setIsCorporateFilter(e.target.checked);
                  setPage(1);
                }}
              />
              {isAr ? "شركات فقط" : "Corporate only"}
            </label>
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
              title={isAr ? "مجموعات العملاء" : "Customer Groups"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<CustomerGroupRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<CustomerGroupRow[]>>("/customer-groups", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((g) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(g)])));
              }}
              isAr={isAr}
            />
          </div>
        </TableToolbar>
        <TableScroll>
        <Table>
          <THead>
            <tr>
              {visibleColumns.map((c) =>
                c.sortField ? (
                  <SortableTh key={c.key} field={c.sortField} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                    {c.label}
                  </SortableTh>
                ) : (
                  <Th key={c.key}>{c.label}</Th>
                ),
              )}
              <Th>{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((g) => (
              <tr key={g.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                {visibleColumns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render(g)}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <RowActions>
                    <RowActionButton
                      icon={Pencil}
                      label={isAr ? "تعديل" : "Edit"}
                      onClick={() => {
                        setEditing(g);
                        setFormOpen(true);
                      }}
                    />
                    <RowActionButton icon={Banknote} label={isAr ? "دفع" : "Pay"} variant="success" onClick={() => setPayingGroup(g)} />
                    {g.status === "ACTIVE" ? (
                      <RowActionButton
                        icon={Power}
                        label={isAr ? "تعطيل" : "Deactivate"}
                        variant="danger"
                        onClick={async () => {
                          if (await confirmAction({ message: isAr ? `تعطيل "${g.nameEn}"؟` : `Deactivate "${g.nameEn}"?`, danger: true })) deactivateMutation.mutate(g.id);
                        }}
                      />
                    ) : (
                      <RowActionButton icon={Power} label={isAr ? "تفعيل" : "Activate"} onClick={() => activateMutation.mutate(g.id)} />
                    )}
                  </RowActions>
                </td>
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
        <GroupFormModal
          isAr={isAr}
          editing={editing}
          priceLists={priceLists ?? []}
          accounts={flatAccounts}
          onClose={() => setFormOpen(false)}
          onSaved={() => setFormOpen(false)}
        />
      )}

      {payingGroup && <PayGroupDueModal isAr={isAr} group={payingGroup} onClose={() => setPayingGroup(null)} />}
    </div>
  );
}

function GroupFormModal({
  isAr,
  editing,
  priceLists,
  accounts,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  editing: CustomerGroupRow | null;
  priceLists: { id: string; nameEn: string; nameAr: string }[];
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(editing?.nameAr ?? "");
  const [isCorporate, setIsCorporate] = useState(editing?.isCorporate ?? false);
  const [defaultAccountId, setDefaultAccountId] = useState(editing?.defaultAccountId ?? "");
  const [creditLimit, setCreditLimit] = useState(editing?.creditLimit ?? "0");
  const [paymentTermsDays, setPaymentTermsDays] = useState(String(editing?.paymentTermsDays ?? 0));
  // Mutually exclusive pricing mode - converted from the reference's price_calculation_type
  // select exactly (percentage vs selling_price_group show/hide different fields below, not both
  // at once) - see priceListResolver.ts for how this actually changes checkout pricing.
  const [priceCalculationType, setPriceCalculationType] = useState<PriceCalculationType>(editing?.priceCalculationType ?? "SELLING_PRICE_GROUP");
  const [discountPercent, setDiscountPercent] = useState(editing?.discountPercent ?? "0");
  const [priceListId, setPriceListId] = useState(editing?.priceListId ?? "");
  const [invoiceType, setInvoiceType] = useState<GroupInvoiceType>(editing?.invoiceType ?? "FINAL");
  const [sendSms, setSendSms] = useState(editing?.sendSms ?? true);
  const [priceEditable, setPriceEditable] = useState(editing?.priceEditable ?? false);
  const [taxNumber, setTaxNumber] = useState(editing?.taxNumber ?? "");
  const [maxAmountPerMonth, setMaxAmountPerMonth] = useState(editing?.maxAmountPerMonth ?? "");
  const [maxInvoicesPerMonth, setMaxInvoicesPerMonth] = useState(editing?.maxInvoicesPerMonth != null ? String(editing.maxInvoicesPerMonth) : "");
  const [maxQtyPerMonth, setMaxQtyPerMonth] = useState(editing?.maxQtyPerMonth ?? "");
  const [maxFor, setMaxFor] = useState<CapScope>(editing?.maxFor ?? "COMPANY");
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nameEn,
        nameAr,
        isCorporate,
        defaultAccountId: defaultAccountId || null,
        creditLimit: Number(creditLimit || 0),
        paymentTermsDays: Number(paymentTermsDays || 0),
        priceCalculationType,
        discountPercent: priceCalculationType === "PERCENTAGE" ? Number(discountPercent || 0) : 0,
        priceListId: priceCalculationType === "SELLING_PRICE_GROUP" ? priceListId || null : null,
        invoiceType,
        sendSms,
        priceEditable,
        taxNumber: isCorporate ? taxNumber || undefined : undefined,
        maxAmountPerMonth: isCorporate && maxAmountPerMonth ? Number(maxAmountPerMonth) : null,
        maxInvoicesPerMonth: isCorporate && maxInvoicesPerMonth ? Number(maxInvoicesPerMonth) : null,
        maxQtyPerMonth: isCorporate && maxQtyPerMonth ? Number(maxQtyPerMonth) : null,
        maxFor: isCorporate ? maxFor : null,
      };
      if (editing) return api.put(`/customer-groups/${editing.id}`, payload);
      return api.post("/customer-groups", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-groups"] });
      onSaved();
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong");
    },
  });

  const canSubmit = nameEn.trim().length > 0 && nameAr.trim().length > 0;

  return (
    <Modal
      title={editing ? (isAr ? "تعديل المجموعة" : "Edit Group") : isAr ? "مجموعة جديدة" : "Add Group"}
      onClose={onClose}
      size="2xl"
    >
      <div className="space-y-4">
        <FormSection title={isAr ? "معلومات أساسية" : "Basic Information"} icon={UsersRound}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "اسم المجموعة (إنجليزي)" : "Customer Group Name (English)"}</label>
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder={isAr ? "اسم المجموعة" : "Customer Group Name"} autoFocus className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "اسم المجموعة (عربي)" : "Customer Group Name (Arabic)"}</label>
              <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" placeholder={isAr ? "اسم المجموعة" : "Customer Group Name"} className={inputClass} />
            </div>
          </div>
          <div className="mt-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isCorporate} onChange={(e) => setIsCorporate(e.target.checked)} />
              <Briefcase className="h-4 w-4 text-slate-400" /> {isAr ? "شركة (كيان اعتباري)" : "Is corporate"}
            </label>
          </div>
        </FormSection>

        <FormSection title={isAr ? "التسعير" : "Pricing"} icon={Percent}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "الحساب" : "Account"}</label>
              <IconSelect icon={BookOpen} value={defaultAccountId} onChange={(e) => setDefaultAccountId(e.target.value)}>
                <option value="">{isAr ? "بلا" : "None"}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {isAr ? a.nameAr || a.nameEn : a.nameEn}
                  </option>
                ))}
              </IconSelect>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "حد الائتمان" : "Credit Limit"}</label>
              <IconInput icon={Banknote} type="number" min={0} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder={isAr ? "اترك فارغًا لعدم وجود حد" : "Keep blank for no limit"} />
            </div>
          </div>
          <div className="mt-3">
            <label className={labelClass}>{isAr ? "طريقة حساب السعر" : "Price calculation type"}</label>
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setPriceCalculationType("PERCENTAGE")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition",
                  priceCalculationType === "PERCENTAGE" ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200",
                )}
              >
                <Percent className="h-3.5 w-3.5" /> {isAr ? "نسبة مئوية" : "Percentage"}
              </button>
              <button
                type="button"
                onClick={() => setPriceCalculationType("SELLING_PRICE_GROUP")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition",
                  priceCalculationType === "SELLING_PRICE_GROUP" ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200",
                )}
              >
                <Tag className="h-3.5 w-3.5" /> {isAr ? "قائمة أسعار" : "Selling Price Group"}
              </button>
            </div>
          </div>
          {priceCalculationType === "PERCENTAGE" ? (
            <div className="mt-3">
              <label className={labelClass}>{isAr ? "نسبة الحساب (%)" : "Calculation Percentage (%)"}</label>
              <IconInput icon={Percent} type="number" min={-100} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder={isAr ? "نسبة الحساب (%)" : "Calculation Percentage (%)"} />
              <p className="mt-1 text-[11px] text-slate-400">
                {isAr
                  ? "السعر النهائي = سعر المنتج + نسبة الحساب. استخدم رقمًا موجبًا للزيادة وسالبًا للتخفيض."
                  : "Selling price = the product's own price + this percentage. Use a positive number to increase, negative to discount."}
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <label className={labelClass}>{isAr ? "قائمة الأسعار" : "Selling Price Group"}</label>
              <IconSelect icon={Tag} value={priceListId} onChange={(e) => setPriceListId(e.target.value)}>
                <option value="">{isAr ? "بلا" : "None"}</option>
                {priceLists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {isAr ? pl.nameAr || pl.nameEn : pl.nameEn}
                  </option>
                ))}
              </IconSelect>
            </div>
          )}
        </FormSection>

        <FormSection title={isAr ? "الفاتورة والإشعارات" : "Invoice & Notifications"} icon={Receipt}>
          <div>
            <label className={labelClass}>{isAr ? "نوع الفاتورة" : "Invoice Type"}</label>
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setInvoiceType("DELIVERY")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition",
                  invoiceType === "DELIVERY" ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200",
                )}
              >
                <Truck className="h-3.5 w-3.5" /> {isAr ? "فاتورة تسليم" : "Delivery Invoice"}
              </button>
              <button
                type="button"
                onClick={() => setInvoiceType("FINAL")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition",
                  invoiceType === "FINAL" ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200",
                )}
              >
                <Receipt className="h-3.5 w-3.5" /> {isAr ? "فاتورة نهائية" : "Final Invoice"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {isAr
                ? "فاتورة التسليم تنشئ عملية بيع كمسودة (تذكرة استلام) بدلاً من فاتورة نهائية مباشرة."
                : "Delivery Invoice creates every new sale as a draft (a laundry intake ticket) instead of finalizing it immediately."}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
              <MessageSquare className="h-4 w-4 text-slate-400" /> {isAr ? "إرسال رسائل SMS" : "Send SMS"}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700" title={isAr ? "لا توجد إمكانية لتعديل السعر يدويًا في نقطة البيع بعد - سيتم حفظ هذا الخيار دون تأثير فعلي حاليًا" : "No manual price override exists at POS yet - saved faithfully, but has no effect until that capability is built"}>
              <input type="checkbox" checked={priceEditable} onChange={(e) => setPriceEditable(e.target.checked)} />
              <Pencil className="h-4 w-4 text-slate-400" /> {isAr ? "السعر قابل للتعديل" : "Price Editable"}
            </label>
          </div>
        </FormSection>

        <FormSection
          title={isAr ? "تفاصيل الشركة" : "Corporate Details"}
          icon={Building2}
          collapsible
          defaultOpen={isCorporate}
          description={!isCorporate ? (isAr ? "فعّل \"شركة\" أعلاه لإظهار هذه الحقول" : 'Enable "Is corporate" above to use these fields') : undefined}
        >
          <fieldset disabled={!isCorporate} className={cn(!isCorporate && "opacity-50")}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{isAr ? "الرقم الضريبي" : "Tax Number"}</label>
                <IconInput icon={Hash} value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder={isAr ? "الرقم الضريبي" : "Tax Number"} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? "شروط الدفع (يوم)" : "Payment Terms (days)"}</label>
                <IconInput icon={CalendarClock} type="number" min={0} value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>{isAr ? "أقصى فواتير شهريًا" : "Max invoices per month"}</label>
                <IconInput icon={Receipt} type="number" min={0} value={maxInvoicesPerMonth} onChange={(e) => setMaxInvoicesPerMonth(e.target.value)} placeholder={isAr ? "بلا حد" : "No limit"} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? "أقصى كمية شهريًا" : "Max quantity per month"}</label>
                <IconInput icon={Package} type="number" min={0} value={maxQtyPerMonth} onChange={(e) => setMaxQtyPerMonth(e.target.value)} placeholder={isAr ? "بلا حد" : "No limit"} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? "أقصى مبلغ شهريًا" : "Max Amount per month"}</label>
                <IconInput icon={Banknote} type="number" min={0} value={maxAmountPerMonth} onChange={(e) => setMaxAmountPerMonth(e.target.value)} placeholder={isAr ? "بلا حد" : "No limit"} />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelClass}>{isAr ? "تطبيق الحد على" : "Apply cap to"}</label>
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setMaxFor("CUSTOMER")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition",
                    maxFor === "CUSTOMER" ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200",
                  )}
                >
                  <User className="h-3.5 w-3.5" /> {isAr ? "كل عميل على حدة" : "For Customer"}
                </button>
                <button
                  type="button"
                  onClick={() => setMaxFor("COMPANY")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition",
                    maxFor === "COMPANY" ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200",
                  )}
                >
                  <Building2 className="h-3.5 w-3.5" /> {isAr ? "إجمالي الشركة" : "For Company"}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {isAr
                  ? "\"لكل عميل\" يطبق الحدود أعلاه على كل عميل ضمن المجموعة بشكل منفصل. \"إجمالي الشركة\" يطبقها على إجمالي مبيعات المجموعة مجتمعة."
                  : '"For Customer" enforces the caps above per individual customer in this group. "For Company" enforces them against the group\'s combined total.'}
              </p>
            </div>
          </fieldset>
        </FormSection>

        {error && <Alert variant="danger">{error}</Alert>}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" fullWidth onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" fullWidth disabled={!canSubmit || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "…" : t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface GroupDueSale {
  id: string;
  invoiceNumber: string | null;
  saleDate: string;
  totalAmount: string;
  dueAmount: string;
  customer: { id: string; nameEn: string };
}

// EJADA reference's Customer Group "Pay" row action (pay-customer-group-due, type=sell) - pays
// down the group's combined outstanding sell due in one lump sum, applied FIFO (oldest invoice
// first) across every customer in the group - see customerGroup.service.ts's payDue().
function PayGroupDueModal({ isAr, group, onClose }: { isAr: boolean; group: CustomerGroupRow; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { locations, currentLocationId } = useBusinessLocation();
  const { data: paymentMethods } = usePaymentMethods();
  const locale = isAr ? "ar-SA" : "en-US";
  const currency = locations.find((l) => l.id === currentLocationId)?.currency ?? "SAR";

  const { data: due, isLoading } = useQuery({
    queryKey: ["customer-groups", group.id, "due"],
    queryFn: async () => (await api.get<ApiSuccess<{ totalDue: string; sales: GroupDueSale[] }>>(`/customer-groups/${group.id}/due`)).data.data,
  });

  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Pre-fill the amount to the full due once it loads, matching the reference's own
  // `payment_line->amount` default - the user can still lower it for a partial payment.
  const totalDue = due ? Number(due.totalDue) : 0;
  if (due && amount === "") setAmount(due.totalDue);

  const payMutation = useMutation({
    mutationFn: async () =>
      api.post(`/customer-groups/${group.id}/pay-due`, {
        businessLocationId,
        paymentMethodId,
        amount: Number(amount),
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-groups"] });
      onClose();
    },
    onError: (err) =>
      setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(businessLocationId && paymentMethodId && Number(amount) > 0 && Number(amount) <= totalDue);

  return (
    <Modal title={`${isAr ? "دفع مستحقات المجموعة" : "Pay Group Due"} - ${isAr ? group.nameAr || group.nameEn : group.nameEn}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">{isAr ? "إجمالي المستحقات" : "Total Due"}</span>
          <span className="ltr-nums font-semibold">{isLoading ? "…" : formatMoney(totalDue, currency, locale)}</span>
        </div>

        {due && due.sales.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-start">{isAr ? "الفاتورة" : "Invoice"}</th>
                  <th className="px-2 py-1.5 text-start">{isAr ? "العميل" : "Customer"}</th>
                  <th className="px-2 py-1.5 text-start">{isAr ? "التاريخ" : "Date"}</th>
                  <th className="px-2 py-1.5 text-end">{isAr ? "المستحق" : "Due"}</th>
                </tr>
              </thead>
              <tbody>
                {due.sales.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{s.invoiceNumber ?? "—"}</td>
                    <td className="px-2 py-1.5">{s.customer.nameEn}</td>
                    <td className="px-2 py-1.5">{formatDate(s.saleDate, locale)}</td>
                    <td className="px-2 py-1.5 text-end ltr-nums">{formatMoney(s.dueAmount, currency, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {due && due.sales.length === 0 && <Alert variant="info">{isAr ? "لا توجد مستحقات على هذه المجموعة" : "This group has no outstanding due"}</Alert>}

        {due && due.sales.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{isAr ? "الفرع" : "Business Location"}</label>
                <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={cn(selectClass, "w-full")}>
                  <option value="">{isAr ? "اختر الفرع" : "Select location"}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.branchName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{isAr ? "طريقة الدفع" : "Payment Method"}</label>
                <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className={cn(selectClass, "w-full")}>
                  <option value="">{isAr ? "اختر طريقة الدفع" : "Select method"}</option>
                  {(paymentMethods ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {isAr ? m.nameAr || m.nameEn : m.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{isAr ? "المبلغ" : "Amount"}</label>
                <input type="number" min={0} max={totalDue} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={cn(inputClass, "w-full")} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? "الرقم المرجعي" : "Reference Number"}</label>
                <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={cn(inputClass, "w-full")} placeholder={isAr ? "اختياري" : "Optional"} />
              </div>
            </div>
            <div>
              <label className={labelClass}>{t("common.notes")}</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={cn(inputClass, "w-full")} rows={2} placeholder={isAr ? "اختياري" : "Optional"} />
            </div>
          </>
        )}

        {error && <Alert variant="danger">{error}</Alert>}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" fullWidth onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {due && due.sales.length > 0 && (
            <Button
              type="button"
              fullWidth
              className="!bg-emerald-600 hover:!bg-emerald-700 active:!bg-emerald-800"
              disabled={!canSubmit || payMutation.isPending}
              onClick={() => payMutation.mutate()}
            >
              {payMutation.isPending ? "…" : isAr ? "تسجيل الدفعة" : "Record Payment"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
