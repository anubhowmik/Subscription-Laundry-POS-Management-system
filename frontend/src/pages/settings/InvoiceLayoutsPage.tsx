import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, InvoiceLayoutSettings, InvoiceTemplateKey } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { confirmAction } from "../../stores/confirmStore";
import { DEFAULT_LABELS, type LabelKey } from "../invoices/invoiceLabels";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Card } from "../../components/ui/Card";
import { RowActions, RowActionButton } from "../../components/ui/Table";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { Plus, Pencil, Trash2, Star } from "lucide-react";

const TEMPLATE_OPTIONS: { value: InvoiceTemplateKey; label: string }[] = [
  { value: "standard", label: "Standard (default)" },
  { value: "thermal58", label: "Thermal 58mm" },
  { value: "thermal80", label: "Thermal 80mm" },
  { value: "a4Full", label: "A4 Full" },
  { value: "a5", label: "A5" },
  { value: "garmentTag", label: "Garment Tag" },
];

interface ToggleState {
  showLogo: boolean;
  showBranchName: boolean;
  showCity: boolean;
  showQrCode: boolean;
  showVatNumber: boolean;
  showCrNumber: boolean;
  showInvoiceUuid: boolean;
  showIcv: boolean;
  showCustomerVat: boolean;
  showCustomerPhone: boolean;
  showItemSku: boolean;
  showDiscountLine: boolean;
  showPaidDue: boolean;
  showEstimatedReady: boolean;
  showRegisterSession: boolean;
  showDigitalSignatureNote: boolean;
}

const TOGGLE_FIELDS: { key: keyof ToggleState; label: string }[] = [
  { key: "showLogo", label: "Logo" },
  { key: "showBranchName", label: "Branch name" },
  { key: "showCity", label: "City" },
  { key: "showQrCode", label: "QR code" },
  { key: "showVatNumber", label: "Branch VAT number" },
  { key: "showCrNumber", label: "Branch CR number" },
  { key: "showInvoiceUuid", label: "Invoice UUID" },
  { key: "showIcv", label: "ICV" },
  { key: "showCustomerVat", label: "Customer VAT number" },
  { key: "showCustomerPhone", label: "Customer phone" },
  { key: "showItemSku", label: "Item SKU" },
  { key: "showDiscountLine", label: "Discount line" },
  { key: "showPaidDue", label: "Paid / Due lines" },
  { key: "showEstimatedReady", label: "Estimated ready time" },
  { key: "showRegisterSession", label: "Register session" },
  { key: "showDigitalSignatureNote", label: "Digital signature note" },
];

const DEFAULT_TOGGLES: ToggleState = {
  showLogo: true,
  showBranchName: true,
  showCity: true,
  showQrCode: true,
  showVatNumber: true,
  showCrNumber: true,
  showInvoiceUuid: true,
  showIcv: true,
  showCustomerVat: true,
  showCustomerPhone: true,
  showItemSku: true,
  showDiscountLine: true,
  showPaidDue: true,
  showEstimatedReady: true,
  showRegisterSession: true,
  showDigitalSignatureNote: true,
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as LabelKey[];

export default function InvoiceLayoutsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { locations, currentLocationId, setCurrentLocationId } = useBusinessLocation();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InvoiceLayoutSettings | null>(null);

  const { data: layouts } = useQuery({
    queryKey: ["invoice-layouts", currentLocationId],
    queryFn: async () =>
      (await api.get<ApiSuccess<InvoiceLayoutSettings[]>>("/invoice-layouts", { params: { businessLocationId: currentLocationId } })).data.data,
    enabled: !!currentLocationId,
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => api.put(`/invoice-layouts/${id}/set-default`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoice-layouts"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/invoice-layouts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoice-layouts"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "تخطيطات الفاتورة" : "Invoice Layouts"}
        actions={
          <Button
            disabled={!currentLocationId}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> {isAr ? "إضافة تخطيط" : "Add Layout"}
          </Button>
        }
      />

      <div className="max-w-xs">
        <label className={labelClass}>{isAr ? "الفرع" : "Branch"}</label>
        <select value={currentLocationId ?? ""} onChange={(e) => setCurrentLocationId(e.target.value)} className={selectClass}>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.branchName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {layouts?.map((layout) => (
          <Card key={layout.id} className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">{layout.name}</h3>
                <p className="text-xs text-slate-500">{TEMPLATE_OPTIONS.find((o) => o.value === layout.templateKey)?.label ?? layout.templateKey}</p>
              </div>
              {layout.isDefault && <Badge variant="success">{isAr ? "افتراضي" : "Default"}</Badge>}
            </div>
            <RowActions align="start">
              <RowActionButton
                icon={Pencil}
                label={t("common.edit")}
                onClick={() => {
                  setEditing(layout);
                  setFormOpen(true);
                }}
              />
              {!layout.isDefault && (
                <RowActionButton icon={Star} label={isAr ? "تعيين كافتراضي" : "Set Default"} onClick={() => setDefaultMutation.mutate(layout.id)} />
              )}
              {!layout.isDefault && (
                <RowActionButton
                  icon={Trash2}
                  label={isAr ? "حذف" : "Delete"}
                  variant="danger"
                  onClick={async () => {
                    if (await confirmAction({ message: isAr ? `حذف "${layout.name}"؟` : `Delete "${layout.name}"?`, danger: true })) {
                      deleteMutation.mutate(layout.id);
                    }
                  }}
                />
              )}
            </RowActions>
          </Card>
        ))}
        {layouts?.length === 0 && (
          <p className="col-span-full py-8 text-center text-slate-400">{isAr ? "لا توجد تخطيطات بعد" : "No layouts yet"}</p>
        )}
      </div>

      {formOpen && currentLocationId && (
        <InvoiceLayoutFormModal isAr={isAr} businessLocationId={currentLocationId} editing={editing} onClose={() => setFormOpen(false)} />
      )}
    </div>
  );
}

function InvoiceLayoutFormModal({
  isAr,
  businessLocationId,
  editing,
  onClose,
}: {
  isAr: boolean;
  businessLocationId: string;
  editing: InvoiceLayoutSettings | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [name, setName] = useState(editing?.name ?? "");
  const [templateKey, setTemplateKey] = useState<InvoiceTemplateKey>(editing?.templateKey ?? "standard");
  const [logoUrl, setLogoUrl] = useState(editing?.logoUrl ?? "");
  const [accentColor, setAccentColor] = useState(editing?.accentColor ?? "#0284c7");
  const [toggles, setToggles] = useState<ToggleState>(
    editing ? (Object.fromEntries(TOGGLE_FIELDS.map((f) => [f.key, editing[f.key]])) as unknown as ToggleState) : DEFAULT_TOGGLES,
  );
  const [labelDrafts, setLabelDrafts] = useState<Partial<Record<LabelKey, { en: string; ar: string }>>>(editing?.labelOverrides ?? {});
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const labelOverrides: Record<string, { en: string; ar: string }> = {};
      for (const key of LABEL_KEYS) {
        const draft = labelDrafts[key];
        if (draft?.en.trim() && draft?.ar.trim()) labelOverrides[key] = { en: draft.en.trim(), ar: draft.ar.trim() };
      }
      const payload = {
        name: name.trim(),
        templateKey,
        logoUrl: logoUrl.trim() || null,
        accentColor,
        ...toggles,
        labelOverrides: Object.keys(labelOverrides).length > 0 ? labelOverrides : null,
      };
      if (editing) return api.put(`/invoice-layouts/${editing.id}`, payload);
      return api.post("/invoice-layouts", { businessLocationId, ...payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-layouts"] });
      onClose();
    },
    onError: (err) => setError(isAxiosError(err) ? (err.response?.data?.message ?? t("common.somethingWentWrong")) : t("common.somethingWentWrong")),
  });

  return (
    <Modal title={editing ? (isAr ? "تعديل التخطيط" : "Edit Layout") : isAr ? "إضافة تخطيط" : "Add Layout"} onClose={onClose} size="xl">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>{isAr ? "اسم التخطيط" : "Layout Name"}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isAr ? "مثال: تخطيط الإيصال الافتراضي" : "e.g. Default Receipt Layout"} autoFocus className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "القالب" : "Template"}</label>
            <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value as InvoiceTemplateKey)} className={selectClass}>
              {TEMPLATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{isAr ? "اللون المميز" : "Accent Color"}</label>
            <input type="color" value={accentColor ?? "#0284c7"} onChange={(e) => setAccentColor(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300" />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>{isAr ? "رابط الشعار" : "Logo URL"}</label>
            <input value={logoUrl ?? ""} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." className={inputClass} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">{isAr ? "الحقول" : "Fields"}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TOGGLE_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={toggles[f.key]} onChange={(e) => setToggles((prev) => ({ ...prev, [f.key]: e.target.checked }))} />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">{isAr ? "تخصيص التسميات" : "Label Overrides"}</h3>
          <p className="mb-2 text-[11px] text-slate-400">{isAr ? "اتركه فارغاً لاستخدام النص الافتراضي الظاهر كتلميح." : "Leave blank to use the default text shown as a placeholder."}</p>
          <div className="max-h-64 space-y-2 overflow-y-auto pe-1">
            {LABEL_KEYS.map((key) => (
              <div key={key} className="grid grid-cols-2 gap-2">
                <input
                  value={labelDrafts[key]?.en ?? ""}
                  onChange={(e) => setLabelDrafts((prev) => ({ ...prev, [key]: { en: e.target.value, ar: prev[key]?.ar ?? "" } }))}
                  placeholder={DEFAULT_LABELS[key].en}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
                <input
                  value={labelDrafts[key]?.ar ?? ""}
                  onChange={(e) => setLabelDrafts((prev) => ({ ...prev, [key]: { en: prev[key]?.en ?? "", ar: e.target.value } }))}
                  placeholder={DEFAULT_LABELS[key].ar}
                  dir="rtl"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
              </div>
            ))}
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" fullWidth onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" fullWidth disabled={!name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
