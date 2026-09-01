import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta, Supplier } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th } from "../../components/ui/Table";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { ShoppingBag, Undo2 } from "lucide-react";

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
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "المشتريات" : "Purchases"}
        actions={
          tab === "PURCHASES" ? (
            <Button onClick={() => setPurchaseFormOpen(true)}>
              + {isAr ? "شراء جديد" : "New Purchase"}
            </Button>
          ) : (
            <Button onClick={() => setReturnFormOpen(true)}>
              + {isAr ? "مرتجع شراء جديد" : "New Purchase Return"}
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard
          icon={ShoppingBag}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "المشتريات" : "Purchases"}
          value={String(purchases?.meta.total ?? 0)}
        />
        <StatCard
          icon={Undo2}
          cardBg="bg-rose-50"
          iconBg="bg-rose-500"
          iconColor="text-white"
          label={isAr ? "مرتجعات الشراء" : "Purchase Returns"}
          value={String(returns?.meta.total ?? 0)}
        />
      </div>

      <div className="flex gap-6 border-b border-slate-200">
        <button
          onClick={() => setTab("PURCHASES")}
          className={cn(
            "pb-2.5 text-sm font-semibold transition-colors",
            tab === "PURCHASES" ? "border-b-2 border-sky-600 text-sky-600" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          {isAr ? "المشتريات" : "Purchases"}
        </button>
        <button
          onClick={() => setTab("RETURNS")}
          className={cn(
            "pb-2.5 text-sm font-semibold transition-colors",
            tab === "RETURNS" ? "border-b-2 border-sky-600 text-sky-600" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          {isAr ? "مرتجعات الشراء" : "Purchase Returns"}
        </button>
      </div>

      {tab === "PURCHASES" && (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <Th>{isAr ? "التاريخ" : "Date"}</Th>
                <Th>{isAr ? "المرجع" : "Reference"}</Th>
                <Th>{isAr ? "المورد" : "Supplier"}</Th>
                <Th>{isAr ? "الأصناف" : "Items"}</Th>
                <Th>{isAr ? "الإجمالي" : "Total"}</Th>
                <Th>{isAr ? "المدفوع" : "Paid"}</Th>
                <Th>{isAr ? "بواسطة" : "By"}</Th>
              </tr>
            </THead>
            <tbody>
              {purchases?.rows.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-xs text-slate-500"><span className="ltr-nums">{new Date(p.purchaseDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                  <td className="px-4 py-3 font-medium"><span className="ltr-nums">{p.referenceNumber}</span></td>
                  <td className="px-4 py-3">{isAr ? p.supplier.nameAr || p.supplier.nameEn : p.supplier.nameEn}</td>
                  <td className="px-4 py-3">
                    {p.items.map((item) => (
                      <div key={item.id} className="text-xs text-slate-600">
                        {isAr ? item.product.nameAr || item.product.nameEn : item.product.nameEn}
                        <span className="ltr-nums text-slate-400"> × {item.quantity}</span>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(p.totalAmount, currency, locale)}</span></td>
                  <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(p.paidAmount, currency, locale)}</span></td>
                  <td className="px-4 py-3 text-slate-500">{p.createdByUser.fullNameEn}</td>
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
          </Table>
        </TableContainer>
      )}

      {tab === "RETURNS" && (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <Th>{isAr ? "التاريخ" : "Date"}</Th>
                <Th>{isAr ? "مرجع الشراء" : "Purchase Ref"}</Th>
                <Th>{isAr ? "المورد" : "Supplier"}</Th>
                <Th>{isAr ? "الأصناف" : "Items"}</Th>
                <Th>{isAr ? "الإجمالي" : "Total"}</Th>
                <Th>{isAr ? "المسترد" : "Refunded"}</Th>
                <Th>{isAr ? "بواسطة" : "By"}</Th>
              </tr>
            </THead>
            <tbody>
              {returns?.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-xs text-slate-500"><span className="ltr-nums">{new Date(r.returnDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                  <td className="px-4 py-3 font-medium"><span className="ltr-nums">{r.purchase.referenceNumber}</span></td>
                  <td className="px-4 py-3">{isAr ? r.supplier.nameAr || r.supplier.nameEn : r.supplier.nameEn}</td>
                  <td className="px-4 py-3">
                    {r.items.map((item) => (
                      <div key={item.id} className="text-xs text-slate-600">
                        {isAr ? item.purchaseItem.product.nameAr || item.purchaseItem.product.nameEn : item.purchaseItem.product.nameEn}
                        <span className="ltr-nums text-slate-400"> × {item.quantity}</span> —{" "}
                        <span className="text-slate-400">{isAr ? REASON_LABEL[item.reason].ar : REASON_LABEL[item.reason].en}</span>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(r.totalAmount, currency, locale)}</span></td>
                  <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(r.refundedAmount, currency, locale)}</span></td>
                  <td className="px-4 py-3 text-slate-500">{r.createdByUser.fullNameEn}</td>
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
          </Table>
        </TableContainer>
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
    <Modal
      title={isAr ? "شراء جديد" : "New Purchase"}
      onClose={onClose}
      size="lg"
      footer={
        <Button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          fullWidth
        >
          {mutation.isPending ? "…" : isAr ? "حفظ الشراء" : "Save Purchase"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "الفرع" : "Branch"}</label>
          <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={selectClass}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.branchName}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <label className={labelClass}>{isAr ? "المورد" : "Supplier"}</label>
          <input
            value={supplier ? (isAr ? supplier.nameAr || supplier.nameEn : supplier.nameEn) : supplierSearch}
            onChange={(e) => {
              setSupplier(null);
              runSupplierSearch(e.target.value);
            }}
            placeholder={isAr ? "ابحث عن مورد..." : "Search for a supplier..."}
            className={inputClass}
          />
          {supplierResults.length > 0 && !supplier && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-sm">
              {supplierResults.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSupplier(s);
                    setSupplierResults([]);
                  }}
                  className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                >
                  {isAr ? s.nameAr || s.nameEn : s.nameEn} <span className="ltr-nums text-xs text-slate-400">({s.code})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <label className={labelClass}>{isAr ? "إضافة منتج" : "Add Product"}</label>
          <input
            value={productSearch}
            onChange={(e) => runProductSearch(e.target.value)}
            placeholder={isAr ? "ابحث عن منتج..." : "Search for a product..."}
            className={inputClass}
          />
          {productResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-sm">
              {productResults.map((p) => (
                <button key={p.id} onClick={() => addProduct(p)} className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100">
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
                      className={cn(inputClass, "ltr-nums")}
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
                      className={cn(inputClass, "ltr-nums")}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className={labelClass}>{isAr ? "المبلغ المدفوع" : "Paid Amount"}</label>
          <input type="number" min={0} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" className={cn(inputClass, "ltr-nums")} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
    </Modal>
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
    <Modal
      title={isAr ? "مرتجع شراء جديد" : "New Purchase Return"}
      onClose={onClose}
      size="lg"
      footer={
        purchase ? (
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={!canSubmit || mutation.isPending}
            fullWidth
          >
            {mutation.isPending ? "…" : isAr ? "تقديم المرتجع" : "Submit Return"}
          </Button>
        ) : undefined
      }
    >
      {!purchaseId && (
        <div className="relative">
          <label className={labelClass}>{isAr ? "مرجع الشراء" : "Purchase Reference"}</label>
          <input
            value={search}
            onChange={(e) => runSearch(e.target.value)}
            placeholder={isAr ? "ابحث برقم المرجع" : "Search by reference number"}
            className={inputClass}
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-sm">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPurchaseId(p.id);
                    setResults([]);
                  }}
                  className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                >
                  {p.referenceNumber}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {purchase && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {purchase.referenceNumber} — {isAr ? purchase.supplier.nameAr || purchase.supplier.nameEn : purchase.supplier.nameEn}
          </p>

          <div className="space-y-2">
            {purchase.items.map((item) => {
              const remaining = Number(item.remaining);
              const selected = lines[item.id];
              return (
                <div key={item.id} className={cn("rounded-lg border p-2.5", remaining <= 0 ? "border-slate-100 bg-slate-50 opacity-50" : "border-slate-200")}>
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
                        className={cn(inputClass, "ltr-nums")}
                      />
                      <select value={selected.reason} onChange={(e) => updateLine(item.id, { reason: e.target.value as ReturnReason })} className={selectClass}>
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
                        className={inputClass}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <label className={labelClass}>{isAr ? "المبلغ المسترد" : "Refunded Amount"}</label>
            <input type="number" min={0} value={refundedAmount} onChange={(e) => setRefundedAmount(e.target.value)} placeholder="0" className={cn(inputClass, "ltr-nums")} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </div>
        </div>
      )}

      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
    </Modal>
  );
}
