import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import {
  usePriceLists,
  usePriceListDetail,
  useCreatePriceList,
  useDeactivatePriceList,
  useSetPriceListItems,
  type PriceListItemRow,
} from "../../api/posApi";
import type { ApiSuccess } from "../../types/api";

interface PickerResult {
  id: string;
  nameEn: string;
  nameAr: string;
}

export default function PriceListsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";

  const { data: priceLists } = usePriceLists();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const deactivateMutation = useDeactivatePriceList();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">{isAr ? "قوائم الأسعار" : "Price Lists"}</h1>
          <button onClick={() => setFormOpen(true)} className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700">
            + {isAr ? "جديد" : "Add"}
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {priceLists?.map((pl) => (
            <button
              key={pl.id}
              onClick={() => setSelectedId(pl.id)}
              className={`flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-start text-sm last:border-0 ${
                selectedId === pl.id ? "bg-sky-50 font-semibold text-sky-700" : "hover:bg-slate-50"
              }`}
            >
              <span>{isAr ? pl.nameAr || pl.nameEn : pl.nameEn}</span>
              {!pl.isActive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t("common.inactive")}</span>}
            </button>
          ))}
          {priceLists?.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">{t("common.noResults")}</div>}
        </div>
      </div>

      <div className="lg:col-span-2">
        {selectedId ? (
          <PriceListDetailPanel
            id={selectedId}
            isAr={isAr}
            onDeactivate={() => {
              deactivateMutation.mutate(selectedId);
              setSelectedId(null);
            }}
          />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">
            {isAr ? "اختر قائمة أسعار لعرض التفاصيل" : "Select a price list to view details"}
          </div>
        )}
      </div>

      {formOpen && (
        <CreatePriceListModal
          isAr={isAr}
          onClose={() => setFormOpen(false)}
          onCreated={(id) => {
            setFormOpen(false);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

function CreatePriceListModal({ isAr, onClose, onCreated }: { isAr: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createMutation = useCreatePriceList();

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{isAr ? "قائمة أسعار جديدة" : "New Price List"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</label>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} autoFocus className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</label>
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" className={inp} />
          </div>
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          onClick={() => {
            setError(null);
            createMutation.mutate(
              { nameEn, nameAr },
              {
                onSuccess: (row) => onCreated(row.id),
                onError: () => setError(isAr ? "تعذّر الإنشاء (قد يكون الاسم مستخدمًا)" : "Could not create (name may already exist)"),
              },
            );
          }}
          disabled={!nameEn.trim() || !nameAr.trim() || createMutation.isPending}
          className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {createMutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </button>
      </div>
    </div>
  );
}

function PriceListDetailPanel({ id, isAr, onDeactivate }: { id: string; isAr: boolean; onDeactivate: () => void }) {
  const { t } = useTranslation();
  const { data: detail } = usePriceListDetail(id);
  const setItemsMutation = useSetPriceListItems();

  const [pendingItems, setPendingItems] = useState<PriceListItemRow[] | null>(null);
  const items = pendingItems ?? detail?.items ?? [];

  const [itemType, setItemType] = useState<"PRODUCT" | "SERVICE">("SERVICE");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PickerResult[]>([]);
  const [picked, setPicked] = useState<PickerResult | null>(null);
  const [price, setPrice] = useState("");

  async function runSearch(value: string) {
    setSearch(value);
    setPicked(null);
    if (!value.trim()) return setResults([]);
    const endpoint = itemType === "PRODUCT" ? "/products" : "/services";
    const res = await api.get<ApiSuccess<PickerResult[]>>(endpoint, { params: { search: value, limit: 8 } });
    setResults(res.data.data);
  }

  function addItem() {
    if (!picked || !price) return;
    const next: PriceListItemRow = {
      id: `pending:${picked.id}`,
      productId: itemType === "PRODUCT" ? picked.id : null,
      serviceId: itemType === "SERVICE" ? picked.id : null,
      price,
      product: itemType === "PRODUCT" ? { nameEn: picked.nameEn } : null,
      service: itemType === "SERVICE" ? { nameEn: picked.nameEn } : null,
    };
    const withoutDup = items.filter((i) => !(i.productId === next.productId && i.serviceId === next.serviceId));
    setPendingItems([...withoutDup, next]);
    setPicked(null);
    setSearch("");
    setResults([]);
    setPrice("");
  }

  function removeItem(item: PriceListItemRow) {
    setPendingItems(items.filter((i) => i !== item));
  }

  function save() {
    setItemsMutation.mutate(
      { id, items: items.map((i) => ({ productId: i.productId ?? undefined, serviceId: i.serviceId ?? undefined, price: Number(i.price) })) },
      { onSuccess: () => setPendingItems(null) },
    );
  }

  if (!detail) return null;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">{isAr ? detail.nameAr || detail.nameEn : detail.nameEn}</h2>
        {detail.isActive && (
          <button onClick={onDeactivate} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
            {isAr ? "تعطيل" : "Deactivate"}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-start">{isAr ? "الصنف" : "Item"}</th>
              <th className="px-3 py-2 text-start">{isAr ? "السعر" : "Price"}</th>
              <th className="px-3 py-2 text-end">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">{item.product?.nameEn ?? item.service?.nameEn ?? "—"}</td>
                <td className="px-3 py-2"><span className="ltr-nums">{item.price}</span></td>
                <td className="px-3 py-2 text-end">
                  <button onClick={() => removeItem(item)} className="text-xs text-red-600 hover:underline">
                    {isAr ? "إزالة" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-3">
        <div className="mb-2 flex gap-2">
          <select
            value={itemType}
            onChange={(e) => {
              setItemType(e.target.value as "PRODUCT" | "SERVICE");
              setSearch("");
              setResults([]);
              setPicked(null);
            }}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="SERVICE">{isAr ? "خدمة" : "Service"}</option>
            <option value="PRODUCT">{isAr ? "منتج" : "Product"}</option>
          </select>
          <div className="relative flex-1">
            <input
              value={picked ? (isAr ? picked.nameAr || picked.nameEn : picked.nameEn) : search}
              onChange={(e) => runSearch(e.target.value)}
              placeholder={isAr ? "ابحث بالاسم..." : "Search by name..."}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
            />
            {results.length > 0 && !picked && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setPicked(r);
                      setResults([]);
                    }}
                    className="block w-full px-3 py-1.5 text-start text-sm hover:bg-sky-50"
                  >
                    {isAr ? r.nameAr || r.nameEn : r.nameEn}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={isAr ? "السعر" : "Price"}
            className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            onClick={addItem}
            disabled={!picked || !price}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {isAr ? "إضافة" : "Add"}
          </button>
        </div>
      </div>

      <button
        onClick={save}
        disabled={setItemsMutation.isPending || !pendingItems}
        className="w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {setItemsMutation.isPending ? "…" : isAr ? "حفظ التغييرات" : "Save Changes"}
      </button>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
