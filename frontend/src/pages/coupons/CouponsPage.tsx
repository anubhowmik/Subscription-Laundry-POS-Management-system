import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useCoupons, useCustomers, type CouponRow } from "../../api/posApi";
import { formatMoney } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "الكوبونات" : "Coupons"}</h1>
        <button onClick={() => setFormOpen(true)} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          + {isAr ? "كوبون جديد" : "Add Coupon"}
        </button>
      </div>

      {formOpen && <CouponFormModal isAr={isAr} onClose={() => setFormOpen(false)} onSaved={() => setFormOpen(false)} />}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "الكود" : "Code"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الخصم" : "Discount"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الحد الأدنى" : "Min Purchase"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الاستخدام" : "Usage"}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-end">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {coupons?.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="px-4 py-2 font-medium"><span className="ltr-nums">{c.code}</span></td>
                <td className="px-4 py-2">
                  <span className="ltr-nums">
                    {c.discountMode === "PERCENT" ? `${c.discountValue}%` : formatMoney(c.discountValue, currency, locale)}
                  </span>
                </td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(c.minPurchaseAmount, currency, locale)}</span></td>
                <td className="px-4 py-2">
                  <span className="ltr-nums">
                    {c.usedCount}
                    {c.maxUses ? ` / ${c.maxUses}` : ""}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {c.isActive ? t("common.active") : t("common.inactive")}
                  </span>
                </td>
                <td className="px-4 py-2 text-end">
                  {c.isActive && (
                    <button
                      onClick={() => {
                        if (window.confirm(isAr ? `تعطيل "${c.code}"؟` : `Deactivate "${c.code}"?`)) deactivateMutation.mutate(c.id);
                      }}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      {isAr ? "تعطيل" : "Deactivate"}
                    </button>
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
        </table>
      </div>
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{isAr ? "كوبون جديد" : "Add Coupon"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pe-1">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الكود" : "Code"}</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus placeholder="SAVE10" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "النوع" : "Type"}</label>
              <select value={discountMode} onChange={(e) => setDiscountMode(e.target.value as "PERCENT" | "FIXED")} className={inp}>
                <option value="PERCENT">{isAr ? "نسبة %" : "Percent %"}</option>
                <option value="FIXED">{isAr ? "مبلغ ثابت" : "Fixed amount"}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "القيمة" : "Value"}</label>
              <input type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الحد الأدنى للشراء" : "Min purchase"}</label>
              <input type="number" min={0} value={minPurchaseAmount} onChange={(e) => setMinPurchaseAmount(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "أقصى استخدام" : "Max uses"}</label>
              <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder={isAr ? "بلا حد" : "Unlimited"} className={inp} />
            </div>
          </div>

          {discountMode === "PERCENT" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "أقصى قيمة خصم" : "Max discount amount"}</label>
              <input
                type="number"
                min={0}
                value={maxDiscountAmount}
                onChange={(e) => setMaxDiscountAmount(e.target.value)}
                placeholder={isAr ? "بلا حد" : "No cap"}
                className={inp}
              />
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">{isAr ? "الاستهداف (اختياري)" : "Targeting (optional)"}</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفرع" : "Branch"}</label>
                <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={inp}>
                  <option value="">{isAr ? "كل الفروع" : "All branches"}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.branchName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "مجموعة العملاء" : "Customer group"}</label>
                <select value={customerGroupId} onChange={(e) => setCustomerGroupId(e.target.value)} className={inp}>
                  <option value="">{isAr ? "أي مجموعة" : "Any group"}</option>
                  {customerGroups?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {isAr ? g.nameAr || g.nameEn : g.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "عميل محدد" : "Specific customer"}</label>
                <input
                  value={pickedCustomer ? (isAr ? pickedCustomer.nameAr || pickedCustomer.nameEn : pickedCustomer.nameEn) : customerSearch}
                  onChange={(e) => {
                    setPickedCustomer(null);
                    setCustomerSearch(e.target.value);
                  }}
                  placeholder={isAr ? "أي عميل" : "Any customer"}
                  className={inp}
                />
                {customerSearch && !pickedCustomer && (customerResults?.length ?? 0) > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                    {customerResults!.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setPickedCustomer(c);
                          setCustomerSearch("");
                        }}
                        className="block w-full px-3 py-1.5 text-start text-sm hover:bg-sky-50"
                      >
                        {isAr ? c.nameAr || c.nameEn : c.nameEn} <span className="ltr-nums text-xs text-slate-400">({c.phone})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "أقصى استخدام لكل عميل" : "Max uses per customer"}</label>
                <input
                  type="number"
                  min={1}
                  value={maxUsesPerCustomer}
                  onChange={(e) => setMaxUsesPerCustomer(e.target.value)}
                  placeholder={isAr ? "بلا حد" : "Unlimited"}
                  className={inp}
                />
              </div>
            </div>
          </div>
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          onClick={() => {
            setError(null);
            createMutation.mutate();
          }}
          disabled={!canSubmit || createMutation.isPending}
          className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {createMutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </button>
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
