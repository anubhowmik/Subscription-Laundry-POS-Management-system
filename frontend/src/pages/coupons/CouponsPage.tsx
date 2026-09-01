import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { confirmAction } from "../../stores/confirmStore";
import type { ApiSuccess } from "../../types/api";
import { useCoupons, useCustomers, type CouponRow } from "../../api/posApi";
import { formatMoney } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th } from "../../components/ui/Table";
import { labelClass, inputClass } from "../../components/ui/formClasses";
import { Ticket } from "lucide-react";

export default function CouponsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const { data: coupons } = useCoupons();
  const [formOpen, setFormOpen] = useState(false);

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/coupons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coupons"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "الكوبونات" : "Coupons"}
        actions={<Button onClick={() => setFormOpen(true)}>+ {isAr ? "كوبون جديد" : "Add Coupon"}</Button>}
      />

      {formOpen && <CouponFormModal isAr={isAr} onClose={() => setFormOpen(false)} onSaved={() => setFormOpen(false)} />}

      <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
        <StatCard
          icon={Ticket}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "الكوبونات" : "Coupons"}
          value={String(coupons?.length ?? 0)}
        />
      </div>

      <TableContainer>
        <Table>
          <THead>
            <tr>
              <Th>{isAr ? "الكود" : "Code"}</Th>
              <Th>{isAr ? "الخصم" : "Discount"}</Th>
              <Th>{isAr ? "الحد الأدنى" : "Min Purchase"}</Th>
              <Th>{isAr ? "الاستخدام" : "Usage"}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {coupons?.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium"><span className="ltr-nums">{c.code}</span></td>
                <td className="px-4 py-3">
                  <span className="ltr-nums">
                    {c.discountMode === "PERCENT" ? `${c.discountValue}%` : formatMoney(c.discountValue, currency, locale)}
                  </span>
                </td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(c.minPurchaseAmount, currency, locale)}</span></td>
                <td className="px-4 py-3">
                  <span className="ltr-nums">
                    {c.usedCount}
                    {c.maxUses ? ` / ${c.maxUses}` : ""}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={c.isActive ? "success" : "neutral"}>{c.isActive ? t("common.active") : t("common.inactive")}</Badge>
                </td>
                <td className="px-4 py-3 text-end">
                  {c.isActive && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={async () => {
                        if (await confirmAction({ message: isAr ? `تعطيل "${c.code}"؟` : `Deactivate "${c.code}"?`, danger: true })) deactivateMutation.mutate(c.id);
                      }}
                    >
                      {isAr ? "تعطيل" : "Deactivate"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {coupons?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableContainer>
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
