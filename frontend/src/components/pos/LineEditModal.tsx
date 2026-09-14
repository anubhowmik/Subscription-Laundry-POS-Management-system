import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useTaxes } from "../../api/posApi";
import { usePosStore, type PosLine } from "../../stores/posStore";
import { formatMoney } from "../../lib/format";
import { calcLine } from "../../lib/posCalc";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { inputClass, labelClass, selectClass, textareaClass, helperTextClass } from "../ui/formClasses";

interface Props {
  line: PosLine;
  currency: string;
  locale: string;
  isAr: boolean;
  onClose: () => void;
}

/**
 * Reference's per-line edit popup (`row_edit_product_price_modal.blade.php`): unit price and tax
 * are only actually editable for a caller holding pos.editLinePrice (Store Manager by default,
 * matching the reference's own `edit_product_price_from_sale_screen` gate) - everyone else sees
 * them read-only but can still set a note or the laundry-specific width/height dimensions, which
 * carry no permission gate on either side.
 */
export function LineEditModal({ line, currency, locale, isAr, onClose }: Props) {
  const { can } = useAuth();
  const canEditPrice = can("pos.editLinePrice");
  const store = usePosStore();
  const { data: taxes } = useTaxes(canEditPrice);

  const [unitPrice, setUnitPrice] = useState(line.unitPriceOverride ?? line.unitPrice);
  const [taxOverrideId, setTaxOverrideId] = useState(line.taxOverrideId ?? "");
  const [note, setNote] = useState(line.note ?? "");
  const [widthM, setWidthM] = useState(line.widthM != null ? String(line.widthM) : "");
  const [heightM, setHeightM] = useState(line.heightM != null ? String(line.heightM) : "");

  const preview = calcLine({
    ...line,
    unitPriceOverride: canEditPrice ? unitPrice : line.unitPriceOverride,
    taxOverridePercent: canEditPrice && taxOverrideId ? Number(taxes?.find((t) => t.id === taxOverrideId)?.percentage ?? 0) : undefined,
    widthM: widthM ? Number(widthM) : undefined,
    heightM: heightM ? Number(heightM) : undefined,
  });

  function save() {
    if (canEditPrice) {
      store.setLineUnitPriceOverride(line.key, unitPrice !== line.unitPrice ? unitPrice : null);
      const chosenTax = taxes?.find((t) => t.id === taxOverrideId);
      store.setLineTaxOverride(line.key, taxOverrideId || null, chosenTax ? Number(chosenTax.percentage) : undefined);
    }
    store.setLineNote(line.key, note);
    store.setLineDimensions(line.key, widthM ? Number(widthM) : null, heightM ? Number(heightM) : null);
    onClose();
  }

  return (
    <Modal
      onClose={onClose}
      title={isAr ? line.nameAr || line.nameEn : line.nameEn}
      subtitle={isAr ? "تعديل السطر" : "Edit line"}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} fullWidth>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={save} fullWidth>
            {isAr ? "حفظ" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{isAr ? "سعر الوحدة" : "Unit Price"}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              disabled={!canEditPrice}
              onChange={(e) => setUnitPrice(Number(e.target.value))}
              className={inputClass}
            />
            {!canEditPrice && <p className={helperTextClass}>{isAr ? "لا تملك صلاحية تعديل السعر" : "You don't have permission to override price"}</p>}
          </div>
          <div>
            <label className={labelClass}>{isAr ? "الضريبة" : "Tax"}</label>
            <select
              value={taxOverrideId}
              disabled={!canEditPrice}
              onChange={(e) => setTaxOverrideId(e.target.value)}
              className={selectClass}
            >
              <option value="">{isAr ? "الافتراضي" : "Default"}</option>
              {taxes?.map((t) => (
                <option key={t.id} value={t.id}>
                  {isAr ? t.nameAr : t.nameEn} ({t.percentage}%)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Laundry's own dimension-based pricing (carpets/curtains priced per m²) - no permission
            gate, unlike price/tax above. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{isAr ? "العرض (م)" : "Width (m)"}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={widthM}
              onChange={(e) => setWidthM(e.target.value)}
              placeholder={isAr ? "اختياري" : "Optional"}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "الطول (م)" : "Height (m)"}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={heightM}
              onChange={(e) => setHeightM(e.target.value)}
              placeholder={isAr ? "اختياري" : "Optional"}
              className={inputClass}
            />
          </div>
        </div>
        {widthM && heightM && (
          <p className={helperTextClass}>
            {isAr
              ? `الكمية المحتسبة: ${line.quantity} × ${widthM} × ${heightM} = ${(line.quantity * Number(widthM) * Number(heightM)).toFixed(3)}`
              : `Billed quantity: ${line.quantity} × ${widthM} × ${heightM} = ${(line.quantity * Number(widthM) * Number(heightM)).toFixed(3)}`}
          </p>
        )}

        <div>
          <label className={labelClass}>{isAr ? "ملاحظة السطر" : "Line Note"}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={textareaClass} />
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>{isAr ? "الضريبة" : "Tax"}</span>
            <span className="ltr-nums">{formatMoney(preview.taxAmount, currency, locale)}</span>
          </div>
          <div className="mt-1 flex justify-between font-semibold text-slate-800">
            <span>{isAr ? "الإجمالي" : "Total"}</span>
            <span className="ltr-nums">{formatMoney(preview.total, currency, locale)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
