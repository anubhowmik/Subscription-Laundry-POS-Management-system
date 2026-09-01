import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ImageOff } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { labelClass, inputClass, selectClass } from "../ui/formClasses";

/**
 * Downscales a picked image to a small JPEG data URL. Product images are stored inline in the
 * `image` text column, so we keep them light (max 512px, ~70% quality).
 */
async function fileToResizedDataUrl(file: File, max = 512, quality = 0.72): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  let { width, height } = img;
  if (width > height && width > max) {
    height = Math.round((height * max) / width);
    width = max;
  } else if (height > max) {
    width = Math.round((width * max) / height);
    height = max;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

interface Named {
  id: string;
  nameEn: string;
  nameAr: string;
}
interface Unit {
  id: string;
}
interface Tax {
  id: string;
  percentage: string;
}
interface Loc {
  id: string;
  branchName: string;
}

export interface EditingProduct {
  id: string;
  nameEn: string;
  nameAr: string;
  sku: string;
  unitId: string;
  categoryId: string | null;
  taxId: string | null;
  sellingPrice: string;
  sellingPriceTaxType: "INCLUSIVE" | "EXCLUSIVE";
  manageStock: boolean;
  image: string | null;
}

interface Props {
  isAr: boolean;
  editing?: EditingProduct | null;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Add/edit a catalogue item. Intentionally minimal for a laundry: name, category, price, tax,
 * and a picture. Retail-only concepts (stock, barcode, brand, SKU, tax-inclusive/exclusive) are
 * handled automatically or omitted - SKU is auto-generated, and items don't track stock.
 */
export function ProductFormModal({ isAr, editing, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories-all"],
    queryFn: async () => (await api.get<ApiSuccess<Named[]>>("/categories")).data.data,
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

  const { data: full } = useQuery({
    queryKey: ["product-detail", editing?.id],
    queryFn: async () => (await api.get<ApiSuccess<{ businessLocations: { businessLocationId: string }[] }>>(`/products/${editing!.id}`)).data.data,
    enabled: Boolean(editing),
  });

  const [form, setForm] = useState({
    nameEn: editing?.nameEn ?? "",
    nameAr: editing?.nameAr ?? "",
    categoryId: editing?.categoryId ?? "",
    newCategory: "",
    taxId: editing?.taxId ?? "",
    price: editing?.sellingPrice ?? "",
    image: editing?.image ?? "",
  });
  const [addingCategory, setAddingCategory] = useState(false);
  const [locIds, setLocIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (taxes?.length && !form.taxId && !editing) setForm((f) => ({ ...f, taxId: taxes[0].id }));
    if (editing) {
      if (full) setLocIds(full.businessLocations.map((b) => b.businessLocationId));
    } else if (locations?.length && locIds.length === 0) {
      setLocIds(locations.map((l) => l.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxes, locations, full]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(isAr ? "الرجاء اختيار صورة" : "Please choose an image file");
      return;
    }
    try {
      set({ image: await fileToResizedDataUrl(file) });
      setError(null);
    } catch {
      setError(isAr ? "تعذّر قراءة الصورة" : "Could not read that image");
    }
  }

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

      const payload = {
        nameEn: form.nameEn.trim(),
        nameAr: form.nameAr.trim() || form.nameEn.trim(),
        categoryId,
        taxId: form.taxId || null,
        sellingPrice: Number(form.price),
        image: form.image || undefined,
        businessLocationIds: locIds,
      };

      if (editing) {
        // Preserve the item's existing SKU / unit / stock / tax-type - the simplified form
        // doesn't expose them, but we must not blank them out on update.
        await api.put(`/products/${editing.id}`, {
          ...payload,
          sku: editing.sku,
          unitId: editing.unitId,
          manageStock: editing.manageStock,
          sellingPriceTaxType: editing.sellingPriceTaxType,
        });
      } else {
        await api.post("/products", {
          ...payload,
          sku: autoSku(form.nameEn),
          unitId: units![0].id,
          manageStock: false, // laundry items aren't stock-tracked
          sellingPriceTaxType: "INCLUSIVE",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["pos", "products"] });
      qc.invalidateQueries({ queryKey: ["pos", "categories"] });
      qc.invalidateQueries({ queryKey: ["categories-all"] });
      onCreated();
    },
    onError: (err) => {
      setError(isAxiosError(err) && err.response?.data?.message ? err.response.data.message : "Could not save item");
    },
  });

  const canSubmit = form.nameEn.trim() && form.nameAr.trim() && Number(form.price) > 0 && locIds.length > 0 && (editing || units?.length);

  return (
    <Modal
      title={editing ? (isAr ? "تعديل الصنف" : "Edit Item") : isAr ? "صنف جديد" : "Add Item"}
      onClose={onClose}
      size="md"
    >
      {/* Image */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {form.image ? <img src={form.image} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-6 w-6 text-slate-300" strokeWidth={1.5} aria-hidden />}
        </div>
        <div className="flex flex-col gap-1">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            {form.image ? (isAr ? "تغيير الصورة" : "Change image") : isAr ? "اختر صورة" : "Choose image"}
          </Button>
          {form.image && (
            <button type="button" onClick={() => set({ image: "" })} className="text-start text-xs text-red-500 hover:underline">
              {isAr ? "إزالة" : "Remove"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={isAr ? "الاسم (إنجليزي)" : "Name (English)"}>
            <input value={form.nameEn} onChange={(e) => set({ nameEn: e.target.value })} className={inputClass} autoFocus />
          </Field>
          <Field label={isAr ? "الاسم (عربي)" : "Name (Arabic)"}>
            <input value={form.nameAr} onChange={(e) => set({ nameAr: e.target.value })} dir="rtl" className={inputClass} />
          </Field>
        </div>

        {/* Category with inline create */}
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
          <Field label={isAr ? "السعر (شامل الضريبة)" : "Price (incl. tax)"}>
            <input type="number" min={0} value={form.price} onChange={(e) => set({ price: e.target.value })} className={inputClass} />
          </Field>
          <Field label={isAr ? "الضريبة" : "Tax"}>
            <select value={form.taxId} onChange={(e) => set({ taxId: e.target.value })} className={selectClass}>
              <option value="">{isAr ? "بدون" : "None"}</option>
              {taxes?.map((tx) => (
                <option key={tx.id} value={tx.id}>{tx.percentage}%</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Branch availability */}
        <div>
          <label className={labelClass}>
            {isAr ? "متوفر في الفروع (يظهر في نقطة البيع)" : "Available at branches (shows in POS)"}
          </label>
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

      <Button
        fullWidth
        className="mt-4"
        onClick={() => { setError(null); saveMutation.mutate(); }}
        disabled={!canSubmit || saveMutation.isPending}
      >
        {saveMutation.isPending ? "…" : editing ? (isAr ? "حفظ التغييرات" : "Save Changes") : isAr ? "حفظ" : "Save"}
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
