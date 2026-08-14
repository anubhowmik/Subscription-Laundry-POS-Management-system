import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta, Supplier } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";

type ReturnReason = "DEFECTIVE" | "WRONG_ITEM" | "OVERSTOCK" | "OTHER";

const REASON_LABEL: Record<ReturnReason, { en: string; ar: string }> = {
  DEFECTIVE: { en: "Defective", ar: "معيب" },
  WRONG_ITEM: { en: "Wrong Item", ar: "صنف خاطئ" },
  OVERSTOCK: { en: "Overstock", ar: "فائض مخزون" },
  OTHER: { en: "Other", ar: "أخرى" },
};

interface PurchaseRow {
  id: string;
  referenceNumber: string;
  purchaseDate: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  supplier: { nameEn: string; nameAr: string | null };
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string };
  items: { id: string; quantity: string; product: { nameEn: string; nameAr: string | null } }[];
}

interface PurchaseReturnRow {
  id: string;
  returnDate: string;
  totalAmount: string;
  refundedAmount: string;
  purchase: { referenceNumber: string };
  supplier: { nameEn: string; nameAr: string | null };
  createdByUser: { fullNameEn: string };
  items: { id: string; quantity: string; reason: ReturnReason; purchaseItem: { product: { nameEn: string; nameAr: string | null } } }[];
}

export default function PurchasesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [tab, setTab] = useState<"PURCHASES" | "RETURNS">("PURCHASES");
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false);
  const [returnFormOpen, setReturnFormOpen] = useState(false);

  const { data: purchases } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PurchaseRow[]>>("/purchases", { params: { limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const { data: returns } = useQuery({
    queryKey: ["purchase-returns"],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PurchaseReturnRow[]>>("/purchases/returns", { params: { limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "المشتريات" : "Purchases"}</h1>
        {tab === "PURCHASES" ? (
          <button onClick={() => setPurchaseFormOpen(true)} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
            + {isAr ? "شراء جديد" : "New Purchase"}
          </button>
        ) : (
          <button onClick={() => setReturnFormOpen(true)} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
            + {isAr ? "مرتجع شراء جديد" : "New Purchase Return"}
          </button>
        )}
      </div>

      <div className="flex gap-6 border-b border-slate-200">
        <button
          onClick={() => setTab("PURCHASES")}
          className={`pb-2 text-sm font-semibold transition ${tab === "PURCHASES" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
        >
          {isAr ? "المشتريات" : "Purchases"}
        </button>
        <button
          onClick={() => setTab("RETURNS")}
          className={`pb-2 text-sm font-semibold transition ${tab === "RETURNS" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
        >
          {isAr ? "مرتجعات الشراء" : "Purchase Returns"}
        </button>
      </div>

      {tab === "PURCHASES" && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 text-start">{isAr ? "التاريخ" : "Date"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "المرجع" : "Reference"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "المورد" : "Supplier"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "الأصناف" : "Items"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "الإجمالي" : "Total"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "المدفوع" : "Paid"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "بواسطة" : "By"}</th>
              </tr>
            </thead>
            <tbody>
              {purchases?.rows.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="px-4 py-2 text-xs text-slate-500"><span className="ltr-nums">{new Date(p.purchaseDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                  <td className="px-4 py-2 font-medium"><span className="ltr-nums">{p.referenceNumber}</span></td>
                  <td className="px-4 py-2">{isAr ? p.supplier.nameAr || p.supplier.nameEn : p.supplier.nameEn}</td>
                  <td className="px-4 py-2">
                    {p.items.map((item) => (
                      <div key={item.id} className="text-xs text-slate-600">
                        {isAr ? item.product.nameAr || item.product.nameEn : item.product.nameEn}
                        <span className="ltr-nums text-slate-400"> × {item.quantity}</span>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(p.totalAmount, currency, locale)}</span></td>
                  <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(p.paidAmount, currency, locale)}</span></td>
                  <td className="px-4 py-2 text-slate-500">{p.createdByUser.fullNameEn}</td>
                </tr>
              ))}
              {purchases?.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {t("common.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "RETURNS" && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 text-start">{isAr ? "التاريخ" : "Date"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "مرجع الشراء" : "Purchase Ref"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "المورد" : "Supplier"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "الأصناف" : "Items"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "الإجمالي" : "Total"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "المسترد" : "Refunded"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "بواسطة" : "By"}</th>
              </tr>
            </thead>
            <tbody>
              {returns?.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-4 py-2 text-xs text-slate-500"><span className="ltr-nums">{new Date(r.returnDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                  <td className="px-4 py-2 font-medium"><span className="ltr-nums">{r.purchase.referenceNumber}</span></td>
                  <td className="px-4 py-2">{isAr ? r.supplier.nameAr || r.supplier.nameEn : r.supplier.nameEn}</td>
                  <td className="px-4 py-2">
                    {r.items.map((item) => (
                      <div key={item.id} className="text-xs text-slate-600">
                        {isAr ? item.purchaseItem.product.nameAr || item.purchaseItem.product.nameEn : item.purchaseItem.product.nameEn}
                        <span className="ltr-nums text-slate-400"> × {item.quantity}</span> —{" "}
                        <span className="text-slate-400">{isAr ? REASON_LABEL[item.reason].ar : REASON_LABEL[item.reason].en}</span>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(r.totalAmount, currency, locale)}</span></td>
                  <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(r.refundedAmount, currency, locale)}</span></td>
                  <td className="px-4 py-2 text-slate-500">{r.createdByUser.fullNameEn}</td>
                </tr>
              ))}
              {returns?.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {t("common.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {purchaseFormOpen && (
        <PurchaseFormModal
          isAr={isAr}
          onClose={() => setPurchaseFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["purchases"] });
            setPurchaseFormOpen(false);
          }}
        />
      )}

      {returnFormOpen && (
        <PurchaseReturnFormModal
          isAr={isAr}
          onClose={() => setReturnFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["purchase-returns"] });
            setReturnFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface ProductPick {
  id: string;
  nameEn: string;
  nameAr: string;
  sku: string;
  purchasePrice: string;
}

interface PurchaseLine {
  productId: string;
  nameEn: string;
  nameAr: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

function PurchaseFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
  const { locations, currentLocationId } = useBusinessLocation();
  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductPick[]>([]);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [paidAmount, setPaidAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function runSupplierSearch(value: string) {
    setSupplierSearch(value);
    if (!value.trim()) return setSupplierResults([]);
    const res = await api.get<ApiSuccess<Supplier[]>>("/suppliers", { params: { search: value, limit: 6 } });
    setSupplierResults(res.data.data);
  }

  async function runProductSearch(value: string) {
    setProductSearch(value);
    if (!value.trim()) return setProductResults([]);
    const res = await api.get<ApiSuccess<ProductPick[]>>("/products", { params: { search: value, limit: 8 } });
    setProductResults(res.data.data);
  }

  function addProduct(p: ProductPick) {
    setProductSearch("");
    setProductResults([]);
    setLines((prev) => {
      if (prev.some((l) => l.productId === p.id)) return prev;
      return [...prev, { productId: p.id, nameEn: p.nameEn, nameAr: p.nameAr, sku: p.sku, quantity: 1, unitCost: Number(p.purchasePrice) }];
    });
  }

  function updateLine(productId: string, patch: Partial<PurchaseLine>) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/purchases", {
        supplierId: supplier!.id,
        businessLocationId,
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })),
        paidAmount: paidAmount ? Number(paidAmount) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(supplier) && Boolean(businessLocationId) && lines.length > 0 && lines.every((l) => l.quantity > 0 && l.unitCost >= 0);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{isAr ? "شراء جديد" : "New Purchase"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفرع" : "Branch"}</label>
            <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={inp}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المورد" : "Supplier"}</label>
            <input
              value={supplier ? (isAr ? supplier.nameAr || supplier.nameEn : supplier.nameEn) : supplierSearch}
              onChange={(e) => {
                setSupplier(null);
                runSupplierSearch(e.target.value);
              }}
              placeholder={isAr ? "ابحث عن مورد..." : "Search for a supplier..."}
              className={inp}
            />
            {supplierResults.length > 0 && !supplier && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                {supplierResults.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSupplier(s);
                      setSupplierResults([]);
                    }}
                    className="block w-full px-3 py-1.5 text-start text-sm hover:bg-sky-50"
                  >
                    {isAr ? s.nameAr || s.nameEn : s.nameEn} <span className="ltr-nums text-xs text-slate-400">({s.code})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إضافة منتج" : "Add Product"}</label>
            <input
              value={productSearch}
              onChange={(e) => runProductSearch(e.target.value)}
              placeholder={isAr ? "ابحث عن منتج..." : "Search for a product..."}
              className={inp}
            />
            {productResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                {productResults.map((p) => (
                  <button key={p.id} onClick={() => addProduct(p)} className="block w-full px-3 py-1.5 text-start text-sm hover:bg-sky-50">
                    {isAr ? p.nameAr || p.nameEn : p.nameEn} <span className="ltr-nums text-xs text-slate-400">({p.sku})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.productId} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-800">
                    <span>
                      {isAr ? l.nameAr || l.nameEn : l.nameEn} <span className="ltr-nums text-xs text-slate-400">({l.sku})</span>
                    </span>
                    <button onClick={() => removeLine(l.productId)} className="text-xs text-red-500 hover:text-red-700">
                      {isAr ? "إزالة" : "Remove"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-500">{isAr ? "الكمية" : "Quantity"}</label>
                      <input
                        type="number"
                        min={0.001}
                        step="0.001"
                        value={l.quantity}
                        onChange={(e) => updateLine(l.productId, { quantity: Number(e.target.value) })}
                        className={inp}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-500">{isAr ? "تكلفة الوحدة" : "Unit Cost"}</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.unitCost}
                        onChange={(e) => updateLine(l.productId, { unitCost: Number(e.target.value) })}
                        className={inp}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المبلغ المدفوع" : "Paid Amount"}</label>
            <input type="number" min={0} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "ملاحظات" : "Notes"}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} />
          </div>
        </div>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {mutation.isPending ? "…" : isAr ? "حفظ الشراء" : "Save Purchase"}
        </button>
      </div>
    </div>
  );
}

interface PurchasePick {
  id: string;
  referenceNumber: string;
}

interface ReturnablePurchase {
  id: string;
  referenceNumber: string;
  supplier: { nameEn: string; nameAr: string | null };
  items: {
    id: string;
    productNameEn: string;
    productNameAr: string | null;
    quantity: string;
    unitCost: string;
    alreadyReturned: string;
    remaining: string;
  }[];
}

interface SelectedReturnLine {
  purchaseItemId: string;
  quantity: number;
  reason: ReturnReason;
  note?: string;
}

function PurchaseReturnFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PurchasePick[]>([]);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, SelectedReturnLine>>({});
  const [refundedAmount, setRefundedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: purchase } = useQuery({
    queryKey: ["returnable-purchase", purchaseId],
    queryFn: async () => (await api.get<ApiSuccess<ReturnablePurchase>>(`/purchases/${purchaseId}/returnable`)).data.data,
    enabled: Boolean(purchaseId),
  });

  async function runSearch(value: string) {
    setSearch(value);
    if (!value.trim()) return setResults([]);
    const res = await api.get<ApiSuccess<PurchasePick[]>>("/purchases", { params: { limit: 50 } });
    setResults(res.data.data.filter((p) => p.referenceNumber.toLowerCase().includes(value.toLowerCase())));
  }

  function toggleLine(itemId: string, remaining: number) {
    setLines((prev) => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId];
      else next[itemId] = { purchaseItemId: itemId, quantity: remaining, reason: "DEFECTIVE" };
      return next;
    });
  }

  function updateLine(itemId: string, patch: Partial<SelectedReturnLine>) {
    setLines((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/purchases/returns", {
        purchaseId,
        items: Object.values(lines).map((l) => ({ purchaseItemId: l.purchaseItemId, quantity: l.quantity, reason: l.reason, note: l.note || undefined })),
        refundedAmount: refundedAmount ? Number(refundedAmount) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(purchaseId) && Object.keys(lines).length > 0 && Object.values(lines).every((l) => l.quantity > 0);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{isAr ? "مرتجع شراء جديد" : "New Purchase Return"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {!purchaseId && (
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "مرجع الشراء" : "Purchase Reference"}</label>
            <input
              value={search}
              onChange={(e) => runSearch(e.target.value)}
              placeholder={isAr ? "ابحث برقم المرجع" : "Search by reference number"}
              className={inp}
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                {results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPurchaseId(p.id);
                      setResults([]);
                    }}
                    className="block w-full px-3 py-1.5 text-start text-sm hover:bg-sky-50"
                  >
                    {p.referenceNumber}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {purchase && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {purchase.referenceNumber} — {isAr ? purchase.supplier.nameAr || purchase.supplier.nameEn : purchase.supplier.nameEn}
            </p>

            <div className="space-y-2">
              {purchase.items.map((item) => {
                const remaining = Number(item.remaining);
                const selected = lines[item.id];
                return (
                  <div key={item.id} className={`rounded-lg border p-2.5 ${remaining <= 0 ? "border-slate-100 bg-slate-50 opacity-50" : "border-slate-200"}`}>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <input type="checkbox" disabled={remaining <= 0} checked={Boolean(selected)} onChange={() => toggleLine(item.id, remaining)} />
                      {isAr ? item.productNameAr || item.productNameEn : item.productNameEn}
                      <span className="ltr-nums text-xs text-slate-400">
                        ({isAr ? "المتبقي" : "remaining"}: {item.remaining} / {item.quantity})
                      </span>
                    </label>
                    {selected && (
                      <div className="mt-2 grid grid-cols-3 gap-2 ps-6">
                        <input
                          type="number"
                          min={0.001}
                          max={remaining}
                          step="0.001"
                          value={selected.quantity}
                          onChange={(e) => updateLine(item.id, { quantity: Number(e.target.value) })}
                          className={inp}
                        />
                        <select value={selected.reason} onChange={(e) => updateLine(item.id, { reason: e.target.value as ReturnReason })} className={inp}>
                          {(Object.keys(REASON_LABEL) as ReturnReason[]).map((r) => (
                            <option key={r} value={r}>
                              {isAr ? REASON_LABEL[r].ar : REASON_LABEL[r].en}
                            </option>
                          ))}
                        </select>
                        <input
                          value={selected.note ?? ""}
                          onChange={(e) => updateLine(item.id, { note: e.target.value })}
                          placeholder={isAr ? "ملاحظة" : "Note"}
                          className={inp}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المبلغ المسترد" : "Refunded Amount"}</label>
              <input type="number" min={0} value={refundedAmount} onChange={(e) => setRefundedAmount(e.target.value)} placeholder="0" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "ملاحظات" : "Notes"}</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} />
            </div>
          </div>
        )}

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {purchase && (
          <button
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={!canSubmit || mutation.isPending}
            className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {mutation.isPending ? "…" : isAr ? "تقديم المرتجع" : "Submit Return"}
          </button>
        )}
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
