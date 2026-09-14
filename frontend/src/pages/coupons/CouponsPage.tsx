import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { confirmAction } from "../../stores/confirmStore";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useCoupons, useCustomers, type CouponRow } from "../../api/posApi";
import { formatMoney } from "../../lib/format";
import { fetchAllRows } from "../../lib/tableExport";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { Pagination } from "../../components/ui/Pagination";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu } from "../../components/ui/TableToolbarControls";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { labelClass, inputClass } from "../../components/ui/formClasses";
import { Ticket, Power } from "lucide-react";
import type { ReactNode } from "react";

export default function CouponsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  // Coupon codes accumulate indefinitely (one per campaign) - a genuinely unbounded, growable
  // list, so it gets real server-side pagination/sorting (see coupon.service.ts's SORTABLE_FIELDS)
  // rather than a client-side-only sort.
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = { sortBy, sortOrder };

  const { data } = useCoupons({ ...filterParams, page, limit });
  const [formOpen, setFormOpen] = useState(false);

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/coupons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coupons"] }),
  });

  const columns: { key: string; label: string; sortField?: string; render: (c: CouponRow) => ReactNode; exportValue: (c: CouponRow) => string | number | null }[] = [
    { key: "code", label: isAr ? "الكود" : "Code", sortField: "code", render: (c) => <span className="ltr-nums">{c.code}</span>, exportValue: (c) => c.code },
    {
      key: "discount",
      label: isAr ? "الخصم" : "Discount",
      sortField: "discountValue",
      render: (c) => <span className="ltr-nums">{c.discountMode === "PERCENT" ? `${c.discountValue}%` : formatMoney(c.discountValue, currency, locale)}</span>,
      exportValue: (c) => (c.discountMode === "PERCENT" ? `${c.discountValue}%` : c.discountValue),
    },
    {
      key: "minPurchaseAmount",
      label: isAr ? "الحد الأدنى" : "Min Purchase",
      sortField: "minPurchaseAmount",
      render: (c) => <span className="ltr-nums">{formatMoney(c.minPurchaseAmount, currency, locale)}</span>,
      exportValue: (c) => Number(c.minPurchaseAmount),
    },
    {
      key: "usage",
      label: isAr ? "الاستخدام" : "Usage",
      sortField: "usedCount",
      render: (c) => (
        <span className="ltr-nums">
          {c.usedCount}
          {c.maxUses ? ` / ${c.maxUses}` : ""}
        </span>
      ),
      exportValue: (c) => `${c.usedCount}${c.maxUses ? ` / ${c.maxUses}` : ""}`,
    },
    {
      key: "status",
      label: t("common.status"),
      render: (c) => <Badge variant={c.isActive ? "success" : "neutral"}>{c.isActive ? t("common.active") : t("common.inactive")}</Badge>,
      exportValue: (c) => (c.isActive ? t("common.active") : t("common.inactive")),
    },
  ];
  const columnVisibility = useColumnVisibility(
    "coupons",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "الكوبونات" : "Coupons"}
        actions={<Button onClick={() => setFormOpen(true)}>+ {isAr ? "كوبون جديد" : "Add Coupon"}</Button>}
      />

      {formOpen && <CouponFormModal isAr={isAr} onClose={() => setFormOpen(false)} onSaved={() => setFormOpen(false)} />}

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Ticket}
            cardBg="bg-app-pos-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "الكوبونات" : "Coupons"}
            value={String(data.meta.total)}
          />
        </div>
      )}

      <TableContainer>
        <TableToolbar>
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
              title={isAr ? "الكوبونات" : "Coupons"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<CouponRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<CouponRow[]>>("/coupons", { params: { ...filterParams, page: p, limit: l } });
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
              {data?.rows.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {visibleColumns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      {col.render(c)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-end">
                    <RowActions>
                      {c.isActive && (
                        <RowActionButton
                          icon={Power}
                          label={isAr ? "تعطيل" : "Deactivate"}
                          variant="danger"
                          onClick={async () => {
                            if (await confirmAction({ message: isAr ? `تعطيل "${c.code}"؟` : `Deactivate "${c.code}"?`, danger: true })) deactivateMutation.mutate(c.id);
                          }}
                        />
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
    </div>
  );
}

interface CustomerGroupRow {
  id: string;
  nameEn: string;
  nameAr: string;
}

function CouponFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const { locations } = useBusinessLocation();
  const [code, setCode] = useState("");
  const [discountMode, setDiscountMode] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [discountValue, setDiscountValue] = useState("");
  const [minPurchaseAmount, setMinPurchaseAmount] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [businessLocationId, setBusinessLocationId] = useState("");
  const [customerGroupId, setCustomerGroupId] = useState("");
  const [maxUsesPerCustomer, setMaxUsesPerCustomer] = useState("");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [pickedCustomer, setPickedCustomer] = useState<{ id: string; nameEn: string; nameAr: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: customerGroups } = useQuery({
    queryKey: ["customer-groups", "all"],
    queryFn: async () => (await api.get<ApiSuccess<CustomerGroupRow[]>>("/customer-groups", { params: { limit: 100 } })).data.data,
  });
  const { data: customerResults } = useCustomers(customerSearch);

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post<{ data: CouponRow }>("/coupons", {
        code,
        discountMode,
        discountValue: Number(discountValue),
        minPurchaseAmount: Number(minPurchaseAmount || 0),
        maxUses: maxUses ? Number(maxUses) : undefined,
        isActive: true,
        businessLocationId: businessLocationId || undefined,
        customerId: pickedCustomer?.id || undefined,
        customerGroupId: customerGroupId || undefined,
        maxUsesPerCustomer: maxUsesPerCustomer ? Number(maxUsesPerCustomer) : undefined,
        maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coupons"] });
      onSaved();
    },
    onError: () => setError(isAr ? "تعذّر إنشاء الكوبون (قد يكون الكود مستخدمًا)" : "Could not create coupon (code may already exist)"),
  });

  const canSubmit = code.trim().length >= 3 && Number(discountValue) > 0;

  return (
    <Modal
      title={isAr ? "كوبون جديد" : "Add Coupon"}
      onClose={onClose}
      footer={
        <Button
          fullWidth
          onClick={() => {
            setError(null);
            createMutation.mutate();
          }}
          disabled={!canSubmit || createMutation.isPending}
        >
          {createMutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "الكود" : "Code"}</label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus placeholder="SAVE10" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{isAr ? "النوع" : "Type"}</label>
            <select value={discountMode} onChange={(e) => setDiscountMode(e.target.value as "PERCENT" | "FIXED")} className={inputClass}>
              <option value="PERCENT">{isAr ? "نسبة %" : "Percent %"}</option>
              <option value="FIXED">{isAr ? "مبلغ ثابت" : "Fixed amount"}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{isAr ? "القيمة" : "Value"}</label>
            <input type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{isAr ? "الحد الأدنى للشراء" : "Min purchase"}</label>
            <input type="number" min={0} value={minPurchaseAmount} onChange={(e) => setMinPurchaseAmount(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "أقصى استخدام" : "Max uses"}</label>
            <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder={isAr ? "بلا حد" : "Unlimited"} className={inputClass} />
          </div>
        </div>

        {discountMode === "PERCENT" && (
          <div>
            <label className={labelClass}>{isAr ? "أقصى قيمة خصم" : "Max discount amount"}</label>
            <input
              type="number"
              min={0}
              value={maxDiscountAmount}
              onChange={(e) => setMaxDiscountAmount(e.target.value)}
              placeholder={isAr ? "بلا حد" : "No cap"}
              className={inputClass}
            />
          </div>
        )}

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold text-slate-500">{isAr ? "الاستهداف (اختياري)" : "Targeting (optional)"}</p>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>{isAr ? "الفرع" : "Branch"}</label>
              <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={inputClass}>
                <option value="">{isAr ? "كل الفروع" : "All branches"}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.branchName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "مجموعة العملاء" : "Customer group"}</label>
              <select value={customerGroupId} onChange={(e) => setCustomerGroupId(e.target.value)} className={inputClass}>
                <option value="">{isAr ? "أي مجموعة" : "Any group"}</option>
                {customerGroups?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {isAr ? g.nameAr || g.nameEn : g.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <label className={labelClass}>{isAr ? "عميل محدد" : "Specific customer"}</label>
              <input
                value={pickedCustomer ? (isAr ? pickedCustomer.nameAr || pickedCustomer.nameEn : pickedCustomer.nameEn) : customerSearch}
                onChange={(e) => {
                  setPickedCustomer(null);
                  setCustomerSearch(e.target.value);
                }}
                placeholder={isAr ? "أي عميل" : "Any customer"}
                className={inputClass}
              />
              {customerSearch && !pickedCustomer && (customerResults?.length ?? 0) > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                  {customerResults!.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setPickedCustomer(c);
                        setCustomerSearch("");
                      }}
                      className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                    >
                      {isAr ? c.nameAr || c.nameEn : c.nameEn} <span className="ltr-nums text-xs text-slate-400">({c.phone})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className={labelClass}>{isAr ? "أقصى استخدام لكل عميل" : "Max uses per customer"}</label>
              <input
                type="number"
                min={1}
                value={maxUsesPerCustomer}
                onChange={(e) => setMaxUsesPerCustomer(e.target.value)}
                placeholder={isAr ? "بلا حد" : "Unlimited"}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="mt-4">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
