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
}
interface Tax {
  id: string;
  percentage: string;
}
interface Loc {
  id: string;
  branchName: string;
}

interface Props {
  isAr: boolean;
  businessLocationId: string;
  onClose: () => void;
  /** Passes the newly created service's id straight back so the caller can add it to the cart. */
  onCreated: (createdId?: string) => void;
}

/**
 * Add Sale's own "Quick Add" for a Service - the reference has no Service concept to converge
 * on (Services POS is this app's own laundry-specific addition), so this mirrors Quick Add
 * Product's OWN completeness bar instead: the full field set `createServiceSchema` already
 * supports (Code, Unit, Business Locations, Description) rather than the Services page's own
 * deliberately-simplified create form (`ServiceFormModal.tsx`, left untouched).
 */
export function QuickAddServiceModal({ isAr, businessLocationId, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["service-categories-all"],
    queryFn: async () => (await api.get<ApiSuccess<Named[]>>("/service-categories")).data.data,
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
    code: "",
    unitId: "",
    categoryId: "",
    newCategory: "",
    price: "",
    taxId: "",
    hours: "24",
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

  function autoCode(name: string) {
    const base = name.replace(/[^a-z0-9]+/gi, "-").toUpperCase().replace(/^-+|-+$/g, "").slice(0, 18) || "SVC";
    return `${base}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      let categoryId = form.categoryId || null;
      if (addingCategory && form.newCategory.trim()) {
        const created = await api.post<ApiSuccess<Named>>("/service-categories", {
          nameEn: form.newCategory.trim(),
          nameAr: form.newCategory.trim(),
        });
        categoryId = created.data.data.id;
      }

      const created = await api.post<ApiSuccess<{ id: string }>>("/services", {
        nameEn: form.nameEn.trim(),
        nameAr: form.nameAr.trim() || form.nameEn.trim(),
        code: form.code.trim() || autoCode(form.nameEn),
        unitId: form.unitId,
        categoryId,
        price: Number(form.price),
        taxId: form.taxId || null,
        estimatedProcessingHours: Number(form.hours || 24),
        descriptionEn: form.descriptionEn || undefined,
        businessLocationIds: locIds,
      });
      return created.data.data.id;
    },
    onSuccess: (createdId) => {
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["pos", "services"] });
      qc.invalidateQueries({ queryKey: ["pos", "service-categories"] });
      qc.invalidateQueries({ queryKey: ["service-categories-all"] });
      onCreated(createdId);
    },
    onError: (err) => {
      setError(isAxiosError(err) && err.response?.data?.message ? err.response.data.message : "Could not save service");
    },
  });

  const canSubmit = form.nameEn.trim() && form.nameAr.trim() && form.unitId && Number(form.price) > 0 && locIds.length > 0;

  return (
    <Modal title={isAr ? "خدمة جديدة (إضافة سريعة)" : "New Service (Quick Add)"} onClose={onClose} size="lg">
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
          <Field label={isAr ? "الرمز" : "Code"}>
            <input value={form.code} onChange={(e) => set({ code: e.target.value })} placeholder={isAr ? "يُنشأ تلقائيًا إن ترك فارغًا" : "Auto-generated if left blank"} className={inputClass} />
          </Field>
          <Field label={isAr ? "الوحدة" : "Unit"}>
            <select value={form.unitId} onChange={(e) => set({ unitId: e.target.value })} className={selectClass}>
              {units?.map((u) => (
                <option key={u.id} value={u.id}>{u.nameEn}</option>
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
          <Field label={isAr ? "السعر" : "Price"}>
            <input type="number" min={0} step="0.01" value={form.price} onChange={(e) => set({ price: e.target.value })} placeholder="0.00" className={inputClass} />
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

        <Field label={isAr ? "مدة التجهيز المتوقعة (ساعة)" : "Estimated Processing Time (hours)"}>
          <input type="number" min={0} value={form.hours} onChange={(e) => set({ hours: e.target.value })} className={inputClass} />
        </Field>

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
