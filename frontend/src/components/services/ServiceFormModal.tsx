import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { labelClass, inputClass, selectClass } from "../ui/formClasses";

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
  nameEn: string;
  nameAr: string;
  percentage: string;
}
interface Loc {
  id: string;
  branchName: string;
}

export interface EditingService {
  id: string;
  nameEn: string;
  nameAr: string;
  code: string;
  price: string;
  categoryId: string | null;
  taxId: string | null;
  estimatedProcessingHours: number;
}

interface Props {
  isAr: boolean;
  editing?: EditingService | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Add/edit a laundry SERVICE (e.g. "Thobe - Wash & Iron"). Deliberately minimal: a service has a
 * name, a category, a price, tax, and a turnaround time. No stock, barcode, or brand - those are
 * retail-product concepts that do not apply to a laundry.
 */
export function ServiceFormModal({ isAr, editing, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["service-categories-all"],
    queryFn: async () => (await api.get<ApiSuccess<Named[]>>("/service-categories")).data.data,
  });
  const { data: taxes } = useQuery({
    queryKey: ["taxes-all"],
    queryFn: async () => (await api.get<ApiSuccess<Tax[]>>("/taxes")).data.data,
  });
  const { data: units } = useQuery({
    queryKey: ["units-all"],
    queryFn: async () => (await api.get<ApiSuccess<Unit[]>>("/units")).data.data,
  });
  const { data: locations } = useQuery({
    queryKey: ["locations-all"],
    queryFn: async () => (await api.get<ApiSuccess<Loc[]>>("/business-locations")).data.data,
  });

  // When editing, pull the full service (incl. its branch assignments) to prefill accurately.
  const { data: full } = useQuery({
    queryKey: ["service-detail", editing?.id],
    queryFn: async () => (await api.get<ApiSuccess<{ businessLocations: { businessLocationId: string }[] }>>(`/services/${editing!.id}`)).data.data,
    enabled: Boolean(editing),
  });

  const [form, setForm] = useState({
    nameEn: editing?.nameEn ?? "",
    nameAr: editing?.nameAr ?? "",
    categoryId: editing?.categoryId ?? "",
    newCategory: "",
    taxId: editing?.taxId ?? "",
    price: editing?.price ?? "",
    hours: String(editing?.estimatedProcessingHours ?? 24),
  });
  const [addingCategory, setAddingCategory] = useState(false);
  const [locIds, setLocIds] = useState<string[]>([]);

  useEffect(() => {
    if (taxes?.length && !form.taxId) setForm((f) => ({ ...f, taxId: taxes[0].id }));
  }, [taxes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default branch selection: the service's existing branches when editing, else all branches.
  useEffect(() => {
    if (editing) {
      if (full) setLocIds(full.businessLocations.map((b) => b.businessLocationId));
    } else if (locations?.length && locIds.length === 0) {
      setLocIds(locations.map((l) => l.id));
    }
  }, [full, locations]); // eslint-disable-line react-hooks/exhaustive-deps

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

      const payload = {
        nameEn: form.nameEn.trim(),
        nameAr: form.nameAr.trim() || form.nameEn.trim(),
        categoryId,
        taxId: form.taxId || null,
        price: Number(form.price),
        estimatedProcessingHours: Number(form.hours || 24),
        businessLocationIds: locIds,
      };

      if (editing) {
        await api.put(`/services/${editing.id}`, payload);
      } else {
        await api.post("/services", { ...payload, code: autoCode(form.nameEn), unitId: units![0].id });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["pos", "services"] });
      qc.invalidateQueries({ queryKey: ["pos", "service-categories"] });
      qc.invalidateQueries({ queryKey: ["service-categories-all"] });
      onSaved();
    },
    onError: (err) => {
      setError(isAxiosError(err) && err.response?.data?.message ? err.response.data.message : "Could not save service");
    },
  });

  const canSubmit = form.nameEn.trim() && form.nameAr.trim() && Number(form.price) > 0 && locIds.length > 0 && units?.length;

  return (
    <Modal
      title={editing ? (isAr ? "تعديل الخدمة" : "Edit Service") : isAr ? "خدمة جديدة" : "Add Service"}
      onClose={onClose}
      size="md"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={isAr ? "الاسم (إنجليزي)" : "Name (English)"}>
            <input value={form.nameEn} onChange={(e) => set({ nameEn: e.target.value })} className={inputClass} autoFocus placeholder="e.g. Thobe - Wash & Iron" />
          </Field>
          <Field label={isAr ? "الاسم (عربي)" : "Name (Arabic)"}>
            <input value={form.nameAr} onChange={(e) => set({ nameAr: e.target.value })} dir="rtl" className={inputClass} placeholder="مثال: ثوب - غسيل وكوي" />
          </Field>
        </div>

        {/* Service category with inline create */}
        <div>
          <label className={labelClass}>{isAr ? "نوع الخدمة" : "Service Category"}</label>
          {addingCategory ? (
            <div className="flex gap-2">
              <input value={form.newCategory} onChange={(e) => set({ newCategory: e.target.value })} placeholder={isAr ? "نوع جديد" : "New category"} className={inputClass} />
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

        <div className="grid grid-cols-3 gap-3">
          <Field label={isAr ? "السعر" : "Price"}>
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
          <Field label={isAr ? "الجاهزية (ساعة)" : "Ready in (hrs)"}>
            <input type="number" min={0} value={form.hours} onChange={(e) => set({ hours: e.target.value })} className={inputClass} />
          </Field>
        </div>

        <div>
          <label className={labelClass}>
            {isAr ? "متوفرة في الفروع (تظهر في نقطة البيع)" : "Available at branches (shows in POS)"}
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
        {saveMutation.isPending ? "…" : editing ? (isAr ? "حفظ التغييرات" : "Save Changes") : isAr ? "حفظ الخدمة" : "Save Service"}
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
