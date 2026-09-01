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
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th } from "../../components/ui/Table";
import { labelClass, inputClass } from "../../components/ui/formClasses";
import { Tags } from "lucide-react";

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
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "قوائم الأسعار" : "Price Lists"}
        actions={<Button onClick={() => setFormOpen(true)}>+ {isAr ? "جديد" : "Add"}</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
        <StatCard
          icon={Tags}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "قوائم الأسعار" : "Price Lists"}
          value={String(priceLists?.length ?? 0)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card className="overflow-hidden p-0">
            {priceLists?.map((pl) => (
              <button
                key={pl.id}
                onClick={() => setSelectedId(pl.id)}
                className={`flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-start text-sm transition-colors last:border-0 ${
                  selectedId === pl.id ? "bg-sky-50 font-semibold text-sky-700" : "hover:bg-slate-100"
                }`}
              >
                <span>{isAr ? pl.nameAr || pl.nameEn : pl.nameEn}</span>
                {!pl.isActive && <Badge variant="neutral">{t("common.inactive")}</Badge>}
              </button>
            ))}
            {priceLists?.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">{t("common.noResults")}</div>}
          </Card>
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
            <Card>
              <EmptyState title={isAr ? "اختر قائمة أسعار لعرض التفاصيل" : "Select a price list to view details"} />
            </Card>
          )}
        </div>
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
    <Modal
      title={isAr ? "قائمة أسعار جديدة" : "New Price List"}
      onClose={onClose}
      footer={
        <Button
          fullWidth
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
        >
          {createMutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</label>
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} autoFocus className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</label>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" className={inputClass} />
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
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">{isAr ? detail.nameAr || detail.nameEn : detail.nameEn}</h2>
        {detail.isActive && (
          <Button variant="danger" size="sm" onClick={onDeactivate}>
            {isAr ? "تعطيل" : "Deactivate"}
          </Button>
        )}
      </div>

      <TableContainer>
        <Table>
          <THead>
            <tr>
              <Th>{isAr ? "الصنف" : "Item"}</Th>
              <Th>{isAr ? "السعر" : "Price"}</Th>
              <Th>{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">{item.product?.nameEn ?? item.service?.nameEn ?? "—"}</td>
                <td className="px-4 py-3"><span className="ltr-nums">{item.price}</span></td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm" onClick={() => removeItem(item)}>
                    {isAr ? "إزالة" : "Remove"}
                  </Button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableContainer>

      <div className="rounded-lg border border-dashed border-slate-300 p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          <select
            value={itemType}
            onChange={(e) => {
              setItemType(e.target.value as "PRODUCT" | "SERVICE");
              setSearch("");
              setResults([]);
              setPicked(null);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          >
            <option value="SERVICE">{isAr ? "خدمة" : "Service"}</option>
            <option value="PRODUCT">{isAr ? "منتج" : "Product"}</option>
          </select>
          <div className="relative flex-1">
            <input
              value={picked ? (isAr ? picked.nameAr || picked.nameEn : picked.nameEn) : search}
              onChange={(e) => runSearch(e.target.value)}
              placeholder={isAr ? "ابحث بالاسم..." : "Search by name..."}
              className={inputClass}
            />
            {results.length > 0 && !picked && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setPicked(r);
                      setResults([]);
                    }}
                    className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
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
            className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          />
          <Button size="sm" onClick={addItem} disabled={!picked || !price}>
            {isAr ? "إضافة" : "Add"}
          </Button>
        </div>
      </div>

      <Button fullWidth onClick={save} disabled={setItemsMutation.isPending || !pendingItems}>
        {setItemsMutation.isPending ? "…" : isAr ? "حفظ التغييرات" : "Save Changes"}
      </Button>
    </Card>
  );
}
