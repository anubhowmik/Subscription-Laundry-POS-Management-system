import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { X } from "lucide-react";
import { api } from "../../api/client";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { labelClass, inputClass, selectClass, inputSmClass } from "../../components/ui/formClasses";
import { useProductPicker, ProductSearchField, type ProductPick } from "./productPicker";

interface AdjLine {
  key: string;
  product: ProductPick;
  quantityChange: string;
  note: string;
}

export default function StockAdjustmentCreatePage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const navigate = useNavigate();
  const { locations, currentLocationId } = useBusinessLocation();

  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [refNo, setRefNo] = useState("");
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
        refNo: refNo || undefined,
        lossType,
        totalAmountRecovered: lossType === "ABNORMAL" && totalAmountRecovered ? Number(totalAmountRecovered) : undefined,
        notes: notes || undefined,
        items: lines.map((l) => ({ productId: l.product.id, quantityChange: Number(l.quantityChange), note: l.note || undefined })),
      }),
    onSuccess: () => navigate("/stock-adjustments"),
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(businessLocationId) && lines.length > 0 && lines.every((l) => Number(l.quantityChange) !== 0);

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "إضافة تعديل مخزون" : "Add Stock Adjustment"} />

      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelClass}>{isAr ? "الفرع" : "Location"}</label>
            <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={selectClass}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{isAr ? "الرقم المرجعي" : "Ref No"}</label>
            <input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder={isAr ? "اختياري" : "Optional"} className={cn(inputClass, "ltr-nums")} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "نوع الفقد" : "Adjustment Type"}</label>
            <select value={lossType} onChange={(e) => setLossType(e.target.value as "NORMAL" | "ABNORMAL")} className={selectClass}>
              <option value="NORMAL">{isAr ? "عادي" : "Normal"}</option>
              <option value="ABNORMAL">{isAr ? "غير عادي" : "Abnormal"}</option>
            </select>
          </div>
          {lossType === "ABNORMAL" && (
            <div>
              <label className={labelClass}>{isAr ? "المبلغ المسترد" : "Total Amount Recovered"}</label>
              <input type="number" min={0} value={totalAmountRecovered} onChange={(e) => setTotalAmountRecovered(e.target.value)} className={cn(inputClass, "ltr-nums")} />
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>{isAr ? "السبب / ملاحظات" : "Reason / Notes"}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(inputClass, "resize-none")} />
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-3">
              <ProductSearchField isAr={isAr} picker={picker} />
            </div>
            <Button variant="secondary" onClick={addLine} disabled={!picker.picked}>
              + {isAr ? "إضافة سطر" : "Add Line"}
            </Button>
          </div>

          {lines.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-start">{isAr ? "المنتج" : "Product"}</th>
                  <th className="px-2 py-1.5 text-start">{isAr ? "التغيير" : "Change"}</th>
                  <th className="px-2 py-1.5 text-start">{isAr ? "ملاحظة" : "Note"}</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">
                      {isAr ? l.product.nameAr || l.product.nameEn : l.product.nameEn}{" "}
                      <span className="ltr-nums text-xs text-slate-400">({l.product.sku})</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        value={l.quantityChange}
                        onChange={(e) => updateLine(l.key, { quantityChange: e.target.value })}
                        placeholder="-2"
                        className={cn(inputSmClass, "ltr-nums w-24")}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={l.note} onChange={(e) => updateLine(l.key, { note: e.target.value })} className={cn(inputSmClass, "w-full")} />
                    </td>
                    <td className="px-2 py-1.5 text-end">
                      <button onClick={() => removeLine(l.key)} className="text-slate-300 hover:text-red-500" aria-label="remove">
                        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {lines.length === 0 && <p className="py-3 text-center text-xs text-slate-400">{isAr ? "أضف منتجات للتعديل" : "Add products to adjust"}</p>}
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending ? "…" : isAr ? "تأكيد التعديل" : "Save"}
          </Button>
          <Button variant="secondary" onClick={() => navigate("/stock-adjustments")}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
