import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { useProductPicker, ProductSearchField } from "./productPicker";

export default function StockTransferCreatePage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const navigate = useNavigate();
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
    onSuccess: () => navigate("/stock-transfers"),
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(picker.picked) && fromId && toId && fromId !== toId && Number(quantity) > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "إضافة تحويل مخزون" : "Add Stock Transfer"} />

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={labelClass}>{isAr ? "المنتج" : "Product"}</label>
            <ProductSearchField isAr={isAr} picker={picker} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "من فرع" : "From"}</label>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={selectClass}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{isAr ? "إلى فرع" : "To"}</label>
            <select value={toId} onChange={(e) => setToId(e.target.value)} className={selectClass}>
              <option value="">{isAr ? "اختر" : "Select"}</option>
              {locations.filter((l) => l.id !== fromId).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{isAr ? "الكمية" : "Quantity"}</label>
            <input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={cn(inputClass, "ltr-nums")} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "اسم السائق" : "Driver Name"}</label>
            <input value={driverName} onChange={(e) => setDriverName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "رقم المركبة" : "Vehicle Number"}</label>
            <input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className={cn(inputClass, "ltr-nums")} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{isAr ? "ملاحظة الشحن" : "Ship Note"}</label>
            <input value={shipNote} onChange={(e) => setShipNote(e.target.value)} className={inputClass} />
          </div>
        </div>

        {error && (
          <Alert variant="danger" className="mt-4">
            {error}
          </Alert>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending ? "…" : isAr ? "شحن التحويل" : "Ship Transfer"}
          </Button>
          <Button variant="secondary" onClick={() => navigate("/stock-transfers")}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
