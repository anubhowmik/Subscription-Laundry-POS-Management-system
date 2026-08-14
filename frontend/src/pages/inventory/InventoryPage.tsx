import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { useAuth } from "../../contexts/AuthContext";

interface ProductPick {
  id: string;
  nameEn: string;
  nameAr: string;
  sku: string;
}

interface TransactionRow {
  id: string;
  type: string;
  quantity: string;
  balanceAfter: string;
  referenceType: string | null;
  note: string | null;
  createdAt: string;
  product: { nameEn: string; nameAr: string; sku: string };
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string } | null;
}

const TYPE_LABEL: Record<string, { en: string; ar: string; cls: string }> = {
  STOCK_IN: { en: "Stock In", ar: "إدخال مخزون", cls: "bg-green-100 text-green-700" },
  STOCK_OUT: { en: "Stock Out", ar: "إخراج مخزون", cls: "bg-red-100 text-red-700" },
  SALE: { en: "Sale", ar: "بيع", cls: "bg-sky-100 text-sky-700" },
  SALE_RETURN: { en: "Return", ar: "إرجاع", cls: "bg-amber-100 text-amber-700" },
  ADJUSTMENT: { en: "Adjustment", ar: "تعديل", cls: "bg-purple-100 text-purple-700" },
  TRANSFER_IN: { en: "Transfer In", ar: "تحويل وارد", cls: "bg-teal-100 text-teal-700" },
  TRANSFER_OUT: { en: "Transfer Out", ar: "تحويل صادر", cls: "bg-orange-100 text-orange-700" },
};

export default function InventoryPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"ADJUST" | "TRANSFER" | "GROUP_ADJUST">("ADJUST");
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ["inventory-transactions", page],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<TransactionRow[]>>("/inventory/transactions", { params: { page, limit: 20 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">{isAr ? "المخزون" : "Inventory"}</h1>

      {(can("inventory.adjust") || can("inventory.transfer")) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex gap-6 border-b border-slate-100 pb-2">
            {can("inventory.adjust") && (
              <button
                onClick={() => setTab("ADJUST")}
                className={`text-sm font-semibold transition ${tab === "ADJUST" ? "border-b-2 border-sky-500 pb-2 text-sky-600" : "pb-2 text-slate-400 hover:text-slate-600"}`}
              >
                {isAr ? "تعديل المخزون" : "Adjust Stock"}
              </button>
            )}
            {can("inventory.transfer") && (
              <button
                onClick={() => setTab("TRANSFER")}
                className={`text-sm font-semibold transition ${tab === "TRANSFER" ? "border-b-2 border-sky-500 pb-2 text-sky-600" : "pb-2 text-slate-400 hover:text-slate-600"}`}
              >
                {isAr ? "تحويل مخزون" : "Transfer Stock"}
              </button>
            )}
            {can("inventory.adjust") && (
              <button
                onClick={() => setTab("GROUP_ADJUST")}
                className={`text-sm font-semibold transition ${tab === "GROUP_ADJUST" ? "border-b-2 border-sky-500 pb-2 text-sky-600" : "pb-2 text-slate-400 hover:text-slate-600"}`}
              >
                {isAr ? "تعديل مجمّع" : "Group Adjustment"}
              </button>
            )}
          </div>

          {tab === "ADJUST" && can("inventory.adjust") && (
            <AdjustForm isAr={isAr} onDone={() => qc.invalidateQueries({ queryKey: ["inventory-transactions"] })} />
          )}
          {tab === "TRANSFER" && can("inventory.transfer") && (
            <ShipTransferForm
              isAr={isAr}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
                qc.invalidateQueries({ queryKey: ["stock-transfers"] });
              }}
            />
          )}
          {tab === "GROUP_ADJUST" && can("inventory.adjust") && (
            <GroupAdjustForm
              isAr={isAr}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
                qc.invalidateQueries({ queryKey: ["stock-adjustments"] });
              }}
            />
          )}
        </div>
      )}

      {tab === "TRANSFER" && can("inventory.transfer") && (
        <PendingTransfers
          isAr={isAr}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
            qc.invalidateQueries({ queryKey: ["stock-transfers"] });
          }}
        />
      )}

      {tab === "GROUP_ADJUST" && (
        <StockAdjustmentsList
          isAr={isAr}
          onDone={() => qc.invalidateQueries({ queryKey: ["inventory-transactions"] })}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "التاريخ" : "Date"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "النوع" : "Type"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "المنتج" : "Product"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الفرع" : "Branch"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الكمية" : "Qty"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الرصيد بعد" : "Balance After"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "ملاحظة" : "Note"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "بواسطة" : "By"}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="px-4 py-2 text-xs text-slate-500"><span className="ltr-nums">{new Date(r.createdAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_LABEL[r.type]?.cls ?? "bg-slate-100 text-slate-600"}`}>
                    {isAr ? TYPE_LABEL[r.type]?.ar ?? r.type : TYPE_LABEL[r.type]?.en ?? r.type}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {isAr ? r.product.nameAr || r.product.nameEn : r.product.nameEn} <span className="ltr-nums text-xs text-slate-400">({r.product.sku})</span>
                </td>
                <td className="px-4 py-2">{r.businessLocation.branchName}</td>
                <td className={`px-4 py-2 font-medium ${Number(r.quantity) < 0 ? "text-red-600" : "text-green-600"}`}>
                  <span className="ltr-nums">
                    {Number(r.quantity) > 0 ? "+" : ""}
                    {r.quantity}
                  </span>
                </td>
                <td className="px-4 py-2"><span className="ltr-nums">{r.balanceAfter}</span></td>
                <td className="px-4 py-2 text-slate-500">{r.note ?? "—"}</td>
                <td className="px-4 py-2 text-slate-500">{r.createdByUser?.fullNameEn ?? "—"}</td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">
            ‹
          </button>
          <span>
            {t("common.page")} {page} {t("common.of")} {data.meta.totalPages}
          </span>
          <button disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">
            ›
          </button>
        </div>
      )}
    </div>
  );
}

function useProductPicker() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductPick[]>([]);
  const [picked, setPicked] = useState<ProductPick | null>(null);

  async function runSearch(value: string) {
    setSearch(value);
    setPicked(null);
    if (!value.trim()) return setResults([]);
    const res = await api.get<ApiSuccess<ProductPick[]>>("/products", { params: { search: value, limit: 8 } });
    setResults(res.data.data);
  }

  function select(p: ProductPick) {
    setPicked(p);
    setSearch("");
    setResults([]);
  }

  return { search, results, picked, select, runSearch, reset: () => { setSearch(""); setResults([]); setPicked(null); } };
}

function ProductSearchField({ isAr, picker }: { isAr: boolean; picker: ReturnType<typeof useProductPicker> }) {
  return (
    <div className="relative">
      <input
        value={picker.picked ? (isAr ? picker.picked.nameAr || picker.picked.nameEn : picker.picked.nameEn) : picker.search}
        onChange={(e) => picker.runSearch(e.target.value)}
        placeholder={isAr ? "ابحث عن منتج..." : "Search for a product..."}
        className={inp}
      />
      {picker.results.length > 0 && !picker.picked && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          {picker.results.map((p) => (
            <button
              key={p.id}
              onClick={() => picker.select(p)}
              className="block w-full px-3 py-1.5 text-start text-sm hover:bg-sky-50"
            >
              {isAr ? p.nameAr || p.nameEn : p.nameEn} <span className="ltr-nums text-xs text-slate-400">({p.sku})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AdjustForm({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const { locations, currentLocationId } = useBusinessLocation();
  const picker = useProductPicker();
  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/inventory/adjust", { productId: picker.picked!.id, businessLocationId, quantityChange: Number(quantityChange), reason }),
    onSuccess: () => {
      picker.reset();
      setQuantityChange("");
      setReason("");
      setError(null);
      onDone();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(picker.picked) && businessLocationId && Number(quantityChange) !== 0 && reason.trim().length > 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المنتج" : "Product"}</label>
        <ProductSearchField isAr={isAr} picker={picker} />
      </div>
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
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "التغيير (+/-)" : "Change (+/-)"}</label>
        <input type="number" value={quantityChange} onChange={(e) => setQuantityChange(e.target.value)} placeholder="-5" className={inp} />
      </div>
      <div className="sm:col-span-3">
        <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "السبب" : "Reason"}</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isAr ? "جرد، تلف، ..." : "Stock count, damage, ..."} className={inp} />
      </div>
      <div className="flex items-end">
        <button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          className="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {mutation.isPending ? "…" : isAr ? "تطبيق" : "Apply"}
        </button>
      </div>
      {error && <p className="sm:col-span-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function ShipTransferForm({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const { locations, currentLocationId } = useBusinessLocation();
  const picker = useProductPicker();
  const [fromId, setFromId] = useState(currentLocationId ?? "");
  const [toId, setToId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [shipNote, setShipNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/inventory/transfers", {
        productId: picker.picked!.id,
        fromBusinessLocationId: fromId,
        toBusinessLocationId: toId,
        quantity: Number(quantity),
        driverName: driverName || undefined,
        vehicleNumber: vehicleNumber || undefined,
        shipNote: shipNote || undefined,
      }),
    onSuccess: () => {
      picker.reset();
      setQuantity("");
      setDriverName("");
      setVehicleNumber("");
      setShipNote("");
      setError(null);
      onDone();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(picker.picked) && fromId && toId && fromId !== toId && Number(quantity) > 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المنتج" : "Product"}</label>
        <ProductSearchField isAr={isAr} picker={picker} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "من فرع" : "From"}</label>
        <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={inp}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.branchName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إلى فرع" : "To"}</label>
        <select value={toId} onChange={(e) => setToId(e.target.value)} className={inp}>
          <option value="">{isAr ? "اختر" : "Select"}</option>
          {locations.filter((l) => l.id !== fromId).map((l) => (
            <option key={l.id} value={l.id}>
              {l.branchName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الكمية" : "Quantity"}</label>
        <input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inp} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "اسم السائق" : "Driver Name"}</label>
        <input value={driverName} onChange={(e) => setDriverName(e.target.value)} className={inp} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "رقم المركبة" : "Vehicle Number"}</label>
        <input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className={inp} />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "ملاحظة الشحن" : "Ship Note"}</label>
        <input value={shipNote} onChange={(e) => setShipNote(e.target.value)} className={inp} />
      </div>
      <div className="flex items-end">
        <button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          className="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {mutation.isPending ? "…" : isAr ? "شحن التحويل" : "Ship Transfer"}
        </button>
      </div>
      {error && <p className="sm:col-span-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

interface StockTransferRow {
  id: string;
  status: "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  fromBusinessLocationId: string;
  toBusinessLocationId: string;
  quantitySent: string;
  quantityReceived: string | null;
  driverName: string | null;
  vehicleNumber: string | null;
  shipNote: string | null;
  receiveNote: string | null;
  shippedAt: string;
  receivedAt: string | null;
  product: { nameEn: string; nameAr: string; sku: string };
  fromBusinessLocation: { branchName: string };
  toBusinessLocation: { branchName: string };
  createdByUser: { fullNameEn: string } | null;
  receivedByUser: { fullNameEn: string } | null;
}

function PendingTransfers({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const { locations } = useBusinessLocation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["stock-transfers", "IN_TRANSIT"],
    queryFn: async () => (await api.get<ApiSuccess<StockTransferRow[]>>("/inventory/transfers", { params: { status: "IN_TRANSIT", limit: 50 } })).data.data,
  });

  const locationIds = new Set(locations.map((l) => l.id));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">{isAr ? "التحويلات المعلقة" : "Pending Transfers"}</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2 text-start">{isAr ? "المنتج" : "Product"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "من" : "From"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "إلى" : "To"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "الكمية المرسلة" : "Qty Sent"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "السائق" : "Driver"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "تاريخ الشحن" : "Shipped"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "إجراءات" : "Actions"}</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((tr) => (
            <TransferRow
              key={tr.id}
              transfer={tr}
              isAr={isAr}
              canReceive={locationIds.has(tr.toBusinessLocationId)}
              canCancel={locationIds.has(tr.fromBusinessLocationId)}
              expanded={expandedId === tr.id}
              onToggle={() => setExpandedId(expandedId === tr.id ? null : tr.id)}
              onDone={() => {
                setExpandedId(null);
                onDone();
              }}
            />
          ))}
          {data?.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                {isAr ? "لا توجد تحويلات معلقة" : "No pending transfers"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TransferRow({
  transfer,
  isAr,
  canReceive,
  canCancel,
  expanded,
  onToggle,
  onDone,
}: {
  transfer: StockTransferRow;
  isAr: boolean;
  canReceive: boolean;
  canCancel: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const [quantityReceived, setQuantityReceived] = useState(transfer.quantitySent);
  const [receiveNote, setReceiveNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const receiveMutation = useMutation({
    mutationFn: async () =>
      api.post(`/inventory/transfers/${transfer.id}/receive`, {
        quantityReceived: Number(quantityReceived),
        receiveNote: receiveNote || undefined,
      }),
    onSuccess: onDone,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => api.post(`/inventory/transfers/${transfer.id}/cancel`),
    onSuccess: onDone,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  return (
    <>
      <tr className="border-b border-slate-100">
        <td className="px-4 py-2">
          {isAr ? transfer.product.nameAr || transfer.product.nameEn : transfer.product.nameEn}{" "}
          <span className="ltr-nums text-xs text-slate-400">({transfer.product.sku})</span>
        </td>
        <td className="px-4 py-2">{transfer.fromBusinessLocation.branchName}</td>
        <td className="px-4 py-2">{transfer.toBusinessLocation.branchName}</td>
        <td className="px-4 py-2"><span className="ltr-nums">{transfer.quantitySent}</span></td>
        <td className="px-4 py-2 text-slate-500">{transfer.driverName ?? "—"}</td>
        <td className="px-4 py-2 text-xs text-slate-500"><span className="ltr-nums">{new Date(transfer.shippedAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
        <td className="px-4 py-2">
          <div className="flex gap-2">
            {canReceive && (
              <button onClick={onToggle} className="rounded-md bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-700">
                {isAr ? "استلام" : "Receive"}
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => {
                  if (window.confirm(isAr ? "إلغاء هذا التحويل؟" : "Cancel this transfer?")) cancelMutation.mutate();
                }}
                disabled={cancelMutation.isPending}
                className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الكمية المستلمة" : "Quantity Received"}</label>
                <input type="number" min={0} value={quantityReceived} onChange={(e) => setQuantityReceived(e.target.value)} className={inp} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "ملاحظة الاستلام" : "Receive Note"}</label>
                <input value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} className={inp} />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setError(null);
                    receiveMutation.mutate();
                  }}
                  disabled={receiveMutation.isPending || Number(quantityReceived) < 0}
                  className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {receiveMutation.isPending ? "…" : isAr ? "تأكيد الاستلام" : "Confirm Receipt"}
                </button>
              </div>
              {error && <p className="sm:col-span-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface AdjLine {
  key: string;
  product: ProductPick;
  quantityChange: string;
  note: string;
}

function GroupAdjustForm({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const { locations, currentLocationId } = useBusinessLocation();
  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [lossType, setLossType] = useState<"NORMAL" | "ABNORMAL">("NORMAL");
  const [totalAmountRecovered, setTotalAmountRecovered] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<AdjLine[]>([]);
  const picker = useProductPicker();
  const [error, setError] = useState<string | null>(null);

  function addLine() {
    if (!picker.picked) return;
    setLines((prev) => [...prev, { key: `${picker.picked!.id}-${prev.length}`, product: picker.picked!, quantityChange: "", note: "" }]);
    picker.reset();
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }
  function updateLine(key: string, patch: Partial<AdjLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/inventory/adjustments", {
        businessLocationId,
        lossType,
        totalAmountRecovered: lossType === "ABNORMAL" && totalAmountRecovered ? Number(totalAmountRecovered) : undefined,
        notes: notes || undefined,
        items: lines.map((l) => ({ productId: l.product.id, quantityChange: Number(l.quantityChange), note: l.note || undefined })),
      }),
    onSuccess: () => {
      setLines([]);
      setNotes("");
      setTotalAmountRecovered("");
      setLossType("NORMAL");
      setError(null);
      onDone();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(businessLocationId) && lines.length > 0 && lines.every((l) => Number(l.quantityChange) !== 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
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
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "نوع الفقد" : "Loss Type"}</label>
          <select value={lossType} onChange={(e) => setLossType(e.target.value as "NORMAL" | "ABNORMAL")} className={inp}>
            <option value="NORMAL">{isAr ? "عادي" : "Normal"}</option>
            <option value="ABNORMAL">{isAr ? "غير عادي" : "Abnormal"}</option>
          </select>
        </div>
        {lossType === "ABNORMAL" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المبلغ المسترد" : "Amount Recovered"}</label>
            <input type="number" min={0} value={totalAmountRecovered} onChange={(e) => setTotalAmountRecovered(e.target.value)} className={`${inp} ltr-nums`} />
          </div>
        )}
        <div className={lossType === "ABNORMAL" ? "" : "sm:col-span-2"}>
          <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "ملاحظات" : "Notes"}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-3">
            <ProductSearchField isAr={isAr} picker={picker} />
          </div>
          <button
            onClick={addLine}
            disabled={!picker.picked}
            className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            + {isAr ? "إضافة سطر" : "Add Line"}
          </button>
        </div>

        {lines.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-1 text-start">{isAr ? "المنتج" : "Product"}</th>
                <th className="px-2 py-1 text-start">{isAr ? "التغيير" : "Change"}</th>
                <th className="px-2 py-1 text-start">{isAr ? "ملاحظة" : "Note"}</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-t border-slate-100">
                  <td className="px-2 py-1">
                    {isAr ? l.product.nameAr || l.product.nameEn : l.product.nameEn}{" "}
                    <span className="ltr-nums text-xs text-slate-400">({l.product.sku})</span>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      value={l.quantityChange}
                      onChange={(e) => updateLine(l.key, { quantityChange: e.target.value })}
                      placeholder="-2"
                      className="ltr-nums w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input value={l.note} onChange={(e) => updateLine(l.key, { note: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                  </td>
                  <td className="px-2 py-1 text-end">
                    <button onClick={() => removeLine(l.key)} className="text-slate-300 hover:text-red-500" aria-label="remove">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {lines.length === 0 && <p className="py-3 text-center text-xs text-slate-400">{isAr ? "أضف منتجات للتعديل" : "Add products to adjust"}</p>}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        onClick={() => {
          setError(null);
          mutation.mutate();
        }}
        disabled={!canSubmit || mutation.isPending}
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {mutation.isPending ? "…" : isAr ? "تأكيد التعديل" : "Confirm Adjustment"}
      </button>
    </div>
  );
}

interface StockAdjustmentItemRow {
  id: string;
  productId: string;
  quantityChange: string;
  note: string | null;
  product: { nameEn: string; nameAr: string; sku: string };
}

interface StockAdjustmentRow {
  id: string;
  adjustmentNumber: string | null;
  adjustmentDate: string;
  lossType: "NORMAL" | "ABNORMAL";
  totalAmountRecovered: string;
  status: "CONFIRMED" | "REVERSED";
  notes: string | null;
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string } | null;
  items: StockAdjustmentItemRow[];
}

function StockAdjustmentsList({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["stock-adjustments"],
    queryFn: async () => (await api.get<ApiSuccess<StockAdjustmentRow[]>>("/inventory/adjustments", { params: { limit: 30 } })).data.data,
  });

  const reverseMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/inventory/adjustments/${id}/reverse`),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["stock-adjustments"] });
      onDone();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">{isAr ? "التعديلات المجمّعة" : "Grouped Adjustments"}</h2>
        {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2 text-start">{isAr ? "الرقم" : "Number"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "الفرع" : "Branch"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "نوع الفقد" : "Loss Type"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "الأصناف" : "Items"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "المسترد" : "Recovered"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "الحالة" : "Status"}</th>
            <th className="px-4 py-2 text-start">{isAr ? "إجراءات" : "Actions"}</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((a) => (
            <tr key={a.id} className="border-b border-slate-100 align-top">
              <td className="px-4 py-2"><span className="ltr-nums">{a.adjustmentNumber}</span></td>
              <td className="px-4 py-2">{a.businessLocation.branchName}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.lossType === "ABNORMAL" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                  {a.lossType === "ABNORMAL" ? (isAr ? "غير عادي" : "Abnormal") : isAr ? "عادي" : "Normal"}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-slate-500">
                {a.items.map((it) => (
                  <div key={it.id}>
                    {isAr ? it.product.nameAr || it.product.nameEn : it.product.nameEn}{" "}
                    <span className={`ltr-nums font-medium ${Number(it.quantityChange) < 0 ? "text-red-600" : "text-green-600"}`}>
                      {Number(it.quantityChange) > 0 ? "+" : ""}
                      {it.quantityChange}
                    </span>
                  </div>
                ))}
              </td>
              <td className="px-4 py-2"><span className="ltr-nums">{a.totalAmountRecovered}</span></td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${a.status === "CONFIRMED" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {a.status === "CONFIRMED" ? (isAr ? "مؤكد" : "Confirmed") : isAr ? "معكوس" : "Reversed"}
                </span>
              </td>
              <td className="px-4 py-2">
                {a.status === "CONFIRMED" && can("inventory.reverse_adjustment") && (
                  <button
                    onClick={() => {
                      if (window.confirm(isAr ? "عكس هذا التعديل؟" : "Reverse this adjustment?")) reverseMutation.mutate(a.id);
                    }}
                    disabled={reverseMutation.isPending}
                    className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                  >
                    {isAr ? "عكس" : "Reverse"}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                {isAr ? "لا توجد تعديلات" : "No adjustments"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
