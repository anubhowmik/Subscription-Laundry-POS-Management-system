import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { labelClass, inputClass, selectClass, textareaClass } from "../ui/formClasses";

interface Named {
  id: string;
  nameEn: string;
  nameAr: string;
}
interface Unit {
  id: string;
  nameEn: string;
  shortName: string;
}
interface Tax {
  id: string;
  percentage: string;
}
interface Loc {
  id: string;
  branchName: string;
}

const BARCODE_TYPES = ["CODE128", "EAN13", "EAN8", "UPCA", "UPCE"];

interface Props {
  isAr: boolean;
  businessLocationId: string;
  onClose: () => void;
  /** Passes the newly created product's id straight back so the caller can add it to the cart. */
  onCreated: (createdId?: string) => void;
}

/**
 * Add Sale's own "Quick Add Product" (`ProductController@quickAdd` /
 * `product/partials/quick_add_product.blade.php`) - converted with the reference's real field
 * set (SKU, Barcode Type, Unit, Brand, Category, Manage Stock + Alert Quantity, Business
 * Locations, Description, Tax + Tax Type, Purchase/Selling Price), NOT the Products page's own
 * deliberately-simplified create form (`ProductFormModal.tsx` - a separate, pre-existing design
 * decision for that page's own everyday workflow, left untouched). Warranty, expiry tracking,
 * IMEI/serial numbers, sub-units, and Product custom fields are skipped - each ties to a
 * reference feature/module this app doesn't have anywhere yet, consistent with every other
 * vertical-gap disclosure in this rebuild.
 */
export function QuickAddProductModal({ isAr, businessLocationId, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories-all"],
    queryFn: async () => (await api.get<ApiSuccess<Named[]>>("/categories")).data.data,
  });
  const { data: brands } = useQuery({
    queryKey: ["brands-all"],
    queryFn: async () => (await api.get<ApiSuccess<Named[]>>("/brands")).data.data,
  });
  const { data: units } = useQuery({
    queryKey: ["units-all"],
    queryFn: async () => (await api.get<ApiSuccess<Unit[]>>("/units")).data.data,
  });
  const { data: taxes } = useQuery({
    queryKey: ["taxes-all"],
    queryFn: async () => (await api.get<ApiSuccess<Tax[]>>("/taxes")).data.data,
  });
  const { data: locations } = useQuery({
    queryKey: ["locations-all"],
    queryFn: async () => (await api.get<ApiSuccess<Loc[]>>("/business-locations")).data.data,
  });

  const [form, setForm] = useState({
    nameEn: "",
    nameAr: "",
    sku: "",
    barcodeType: "CODE128",
    unitId: "",
    brandId: "",
    categoryId: "",
    newCategory: "",
    manageStock: true,
    alertQuantity: "",
    // Reference's own `quick_product_opening_stock` partial (shown when adding a product from
    // the POS/Add Sale screen specifically) - without this, a manage-stock item is created with
    // zero on-hand quantity and immediately refused as "out of stock" the moment it's added to
    // THIS SAME cart, which is a confusing dead end for a quick-add mid-sale.
    openingStock: "",
    purchasePrice: "",
    sellingPrice: "",
    taxId: "",
    sellingPriceTaxType: "EXCLUSIVE" as "EXCLUSIVE" | "INCLUSIVE",
    descriptionEn: "",
  });
  const [addingCategory, setAddingCategory] = useState(false);
  const [locIds, setLocIds] = useState<string[]>([businessLocationId]);

  useEffect(() => {
    if (units?.length && !form.unitId) setForm((f) => ({ ...f, unitId: units[0].id }));
    if (taxes?.length && !form.taxId) setForm((f) => ({ ...f, taxId: taxes[0].id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, taxes]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function autoSku(name: string) {
    const base = name.replace(/[^a-z0-9]+/gi, "-").toUpperCase().replace(/^-+|-+$/g, "").slice(0, 18) || "ITEM";
    return `${base}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      let categoryId = form.categoryId || null;
      if (addingCategory && form.newCategory.trim()) {
        const created = await api.post<ApiSuccess<Named>>("/categories", {
          nameEn: form.newCategory.trim(),
          nameAr: form.newCategory.trim(),
        });
        categoryId = created.data.data.id;
      }

      const created = await api.post<ApiSuccess<{ id: string }>>("/products", {
        nameEn: form.nameEn.trim(),
        nameAr: form.nameAr.trim() || form.nameEn.trim(),
        sku: form.sku.trim() || autoSku(form.nameEn),
        barcodeType: form.barcodeType,
        unitId: form.unitId,
        brandId: form.brandId || null,
        categoryId,
        manageStock: form.manageStock,
        alertQuantity: form.manageStock && form.alertQuantity ? Number(form.alertQuantity) : undefined,
        initialStock: form.manageStock && form.openingStock ? Number(form.openingStock) : undefined,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        sellingPrice: Number(form.sellingPrice),
        taxId: form.taxId || null,
        sellingPriceTaxType: form.sellingPriceTaxType,
        descriptionEn: form.descriptionEn || undefined,
        businessLocationIds: locIds,
      });
      return created.data.data.id;
    },
    onSuccess: (createdId) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["pos", "products"] });
      qc.invalidateQueries({ queryKey: ["pos", "categories"] });
      qc.invalidateQueries({ queryKey: ["categories-all"] });
      onCreated(createdId);
    },
    onError: (err) => {
      setError(isAxiosError(err) && err.response?.data?.message ? err.response.data.message : "Could not save product");
    },
  });

  const canSubmit = form.nameEn.trim() && form.nameAr.trim() && form.unitId && Number(form.sellingPrice) > 0 && locIds.length > 0;

  return (
    <Modal title={isAr ? "منتج جديد (إضافة سريعة)" : "New Product (Quick Add)"} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={isAr ? "الاسم (إنجليزي)" : "Name (English)"}>
            <input value={form.nameEn} onChange={(e) => set({ nameEn: e.target.value })} className={inputClass} autoFocus />
          </Field>
          <Field label={isAr ? "الاسم (عربي)" : "Name (Arabic)"}>
            <input value={form.nameAr} onChange={(e) => set({ nameAr: e.target.value })} dir="rtl" className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={isAr ? "رمز الصنف (SKU)" : "SKU"}>
            <input value={form.sku} onChange={(e) => set({ sku: e.target.value })} placeholder={isAr ? "يُنشأ تلقائيًا إن ترك فارغًا" : "Auto-generated if left blank"} className={inputClass} />
          </Field>
          <Field label={isAr ? "نوع الباركود" : "Barcode Type"}>
            <select value={form.barcodeType} onChange={(e) => set({ barcodeType: e.target.value })} className={selectClass}>
              {BARCODE_TYPES.map((bt) => (
                <option key={bt} value={bt}>{bt}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={isAr ? "الوحدة" : "Unit"}>
            <select value={form.unitId} onChange={(e) => set({ unitId: e.target.value })} className={selectClass}>
              {units?.map((u) => (
                <option key={u.id} value={u.id}>{u.nameEn}</option>
              ))}
            </select>
          </Field>
          <Field label={isAr ? "العلامة التجارية" : "Brand"}>
            <select value={form.brandId} onChange={(e) => set({ brandId: e.target.value })} className={selectClass}>
              <option value="">{isAr ? "بدون" : "None"}</option>
              {brands?.map((b) => (
                <option key={b.id} value={b.id}>{isAr ? b.nameAr || b.nameEn : b.nameEn}</option>
              ))}
            </select>
          </Field>
        </div>

        <div>
          <label className={labelClass}>{isAr ? "التصنيف" : "Category"}</label>
          {addingCategory ? (
            <div className="flex gap-2">
              <input value={form.newCategory} onChange={(e) => set({ newCategory: e.target.value })} placeholder={isAr ? "اسم التصنيف الجديد" : "New category name"} className={inputClass} />
              <Button type="button" variant="outline" onClick={() => { setAddingCategory(false); set({ newCategory: "" }); }}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })} className={selectClass}>
                <option value="">{isAr ? "بدون تصنيف" : "No category"}</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>{isAr ? c.nameAr || c.nameEn : c.nameEn}</option>
                ))}
              </select>
              <Button type="button" variant="outline" className="whitespace-nowrap border-sky-300 text-sky-700 hover:border-sky-400 hover:bg-sky-100" onClick={() => setAddingCategory(true)}>
                + {isAr ? "جديد" : "New"}
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 pt-6">
            <input id="qa-manage-stock" type="checkbox" checked={form.manageStock} onChange={(e) => set({ manageStock: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            <label htmlFor="qa-manage-stock" className="text-sm font-medium text-slate-700">{isAr ? "تتبع المخزون" : "Manage Stock"}</label>
          </div>
          {form.manageStock && (
            <Field label={isAr ? "حد التنبيه" : "Alert Quantity"}>
              <input type="number" min={0} value={form.alertQuantity} onChange={(e) => set({ alertQuantity: e.target.value })} className={inputClass} />
            </Field>
          )}
        </div>

        {form.manageStock && (
          <Field label={isAr ? "المخزون الافتتاحي" : "Opening Stock"}>
            <input type="number" min={0} value={form.openingStock} onChange={(e) => set({ openingStock: e.target.value })} placeholder="0" className={inputClass} />
            <p className="mt-1 text-xs text-slate-400">
              {isAr ? "أدخل كمية حتى يمكن إضافته إلى هذه الفاتورة فورًا" : "Set a quantity so it can be added to this sale right away"}
            </p>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={isAr ? "سعر الشراء" : "Purchase Price"}>
            <input type="number" min={0} step="0.01" value={form.purchasePrice} onChange={(e) => set({ purchasePrice: e.target.value })} placeholder="0.00" className={inputClass} />
          </Field>
          <Field label={isAr ? "سعر البيع" : "Selling Price"}>
            <input type="number" min={0} step="0.01" value={form.sellingPrice} onChange={(e) => set({ sellingPrice: e.target.value })} placeholder="0.00" className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={isAr ? "الضريبة" : "Tax"}>
            <select value={form.taxId} onChange={(e) => set({ taxId: e.target.value })} className={selectClass}>
              <option value="">{isAr ? "بدون" : "None"}</option>
              {taxes?.map((tx) => (
                <option key={tx.id} value={tx.id}>{tx.percentage}%</option>
              ))}
            </select>
          </Field>
          <Field label={isAr ? "نوع سعر البيع" : "Selling Price Tax Type"}>
            <select value={form.sellingPriceTaxType} onChange={(e) => set({ sellingPriceTaxType: e.target.value as "EXCLUSIVE" | "INCLUSIVE" })} className={selectClass}>
              <option value="EXCLUSIVE">{isAr ? "غير شامل" : "Exclusive"}</option>
              <option value="INCLUSIVE">{isAr ? "شامل" : "Inclusive"}</option>
            </select>
          </Field>
        </div>

        <Field label={isAr ? "الوصف" : "Description"}>
          <textarea value={form.descriptionEn} onChange={(e) => set({ descriptionEn: e.target.value })} rows={2} className={textareaClass} />
        </Field>

        <div>
          <label className={labelClass}>{isAr ? "متوفر في الفروع (يظهر في نقطة البيع)" : "Available at branches (shows in POS)"}</label>
          <div className="flex flex-wrap gap-2">
            {locations?.map((l) => {
              const on = locIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLocIds((prev) => (on ? prev.filter((x) => x !== l.id) : [...prev, l.id]))}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${on ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {l.branchName}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

      <Button fullWidth className="mt-4" onClick={() => { setError(null); saveMutation.mutate(); }} disabled={!canSubmit || saveMutation.isPending}>
        {saveMutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
      </Button>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}
