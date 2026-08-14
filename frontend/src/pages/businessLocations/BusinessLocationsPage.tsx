import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, BusinessLocation, BusinessLocationGroup, InvoiceLayoutSettings, InvoiceTemplateKey } from "../../types/api";
import { ZatcaCertificateCell } from "../../components/businessLocations/ZatcaCertificateCell";
import { usePriceLists } from "../../api/posApi";
import { DEFAULT_LABELS, type LabelKey } from "../invoices/invoiceLabels";

const schema = z.object({
  businessNameEn: z.string().min(1, "Required"),
  businessNameAr: z.string().min(1, "Required"),
  branchName: z.string().min(1, "Required"),
  branchNameAr: z.string().optional(),
  branchCode: z.string().min(1, "Required"),
  address: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  postalCode: z.string().optional(),
  buildingNo: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  vatNumber: z
    .string()
    .regex(/^3\d{13}3$/, "Must be 15 digits, starting and ending with 3")
    .or(z.literal(""))
    .optional(),
  crNumber: z.string().optional(),
  nationalAddress: z.string().optional(),
  groupId: z.string().optional(),
  defaultPriceListId: z.string().optional(),
  receiptPrinterType: z.enum(["browser", "printer"]),
  printReceiptOnInvoice: z.boolean(),
  printerName: z.string().optional(),
  paperWidthMm: z.string().optional(),
  invoiceNumberPrefix: z.string().min(1, "Required"),
  quoteNumberPrefix: z.string().min(1, "Required"),
  draftNumberPrefix: z.string().min(1, "Required"),
  returnNumberPrefix: z.string().min(1, "Required"),
  reissueNumberPrefix: z.string().min(1, "Required"),
  numberResetYearly: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export default function BusinessLocationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BusinessLocation | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [layoutEditing, setLayoutEditing] = useState<BusinessLocation | null>(null);

  const { data: locations } = useQuery({
    queryKey: ["all-business-locations-admin"],
    queryFn: async () => (await api.get<ApiSuccess<BusinessLocation[]>>("/business-locations", { params: { limit: 100 } })).data.data,
  });

  const { data: groups } = useQuery({
    queryKey: ["business-location-groups"],
    queryFn: async () => (await api.get<ApiSuccess<BusinessLocationGroup[]>>("/business-location-groups", { params: { limit: 100 } })).data.data,
  });

  const { data: priceLists } = usePriceLists();

  const createGroupMutation = useMutation({
    mutationFn: async (nameEn: string) => (await api.post<ApiSuccess<BusinessLocationGroup>>("/business-location-groups", { nameEn })).data.data,
    onSuccess: (group) => {
      // Inject the new group into the cache directly (no network round-trip needed) so the
      // <option> renders immediately, then defer setValue to the next tick - a native <select>'s
      // value can't be set to an <option> that doesn't exist in the DOM yet, and React's render
      // from the cache update above hasn't committed by the time this callback continues.
      queryClient.setQueryData<BusinessLocationGroup[]>(["business-location-groups"], (old) => [...(old ?? []), group]);
      setNewGroupName("");
      setTimeout(() => setValue("groupId", group.id), 0);
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!editing) return;
      return api.put(`/business-locations/${editing.id}`, {
        ...values,
        groupId: values.groupId || null,
        defaultPriceListId: values.defaultPriceListId || null,
        paperWidthMm: values.paperWidthMm ? Number(values.paperWidthMm) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-business-locations-admin"] });
      queryClient.invalidateQueries({ queryKey: ["all-business-locations"] });
      setEditing(null);
      setServerError(null);
    },
    onError: (err) => {
      setServerError(isAxiosError(err) ? err.response?.data?.message ?? t("common.somethingWentWrong") : t("common.somethingWentWrong"));
    },
  });

  function openEdit(loc: BusinessLocation) {
    setEditing(loc);
    reset({
      businessNameEn: loc.businessNameEn,
      businessNameAr: loc.businessNameAr,
      branchName: loc.branchName,
      branchNameAr: loc.branchNameAr ?? "",
      branchCode: loc.branchCode,
      address: loc.address ?? "",
      city: loc.city ?? "",
      district: loc.district ?? "",
      postalCode: loc.postalCode ?? "",
      buildingNo: loc.buildingNo ?? "",
      phone: loc.phone ?? "",
      email: loc.email ?? "",
      vatNumber: loc.vatNumber ?? "",
      crNumber: loc.crNumber ?? "",
      nationalAddress: loc.nationalAddress ?? "",
      groupId: loc.groupId ?? "",
      defaultPriceListId: loc.defaultPriceListId ?? "",
      receiptPrinterType: loc.receiptPrinterType,
      printReceiptOnInvoice: loc.printReceiptOnInvoice,
      printerName: loc.printerName ?? "",
      paperWidthMm: loc.paperWidthMm != null ? String(loc.paperWidthMm) : "",
      invoiceNumberPrefix: loc.invoiceNumberPrefix,
      quoteNumberPrefix: loc.quoteNumberPrefix,
      draftNumberPrefix: loc.draftNumberPrefix,
      returnNumberPrefix: loc.returnNumberPrefix,
      reissueNumberPrefix: loc.reissueNumberPrefix,
      numberResetYearly: loc.numberResetYearly,
    });
    setServerError(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Business Locations</h1>
        <p className="text-sm text-slate-500">
          The VAT number here is required before any invoice can be issued from that location (ZATCA requirement).
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">Branch</th>
              <th className="px-4 py-2 text-start">Code</th>
              <th className="px-4 py-2 text-start">Group</th>
              <th className="px-4 py-2 text-start">VAT Number</th>
              <th className="px-4 py-2 text-start">CR Number</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-start">ZATCA Certificate</th>
              <th className="px-4 py-2 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {locations?.map((loc) => (
              <tr key={loc.id} className="border-b border-slate-100">
                <td className="px-4 py-2">{loc.branchName}</td>
                <td className="px-4 py-2"><span className="ltr-nums">{loc.branchCode}</span></td>
                <td className="px-4 py-2 text-slate-500">{loc.group?.nameEn ?? "-"}</td>
                <td className="px-4 py-2">
                  <span className="ltr-nums">{loc.vatNumber ?? <span className="text-amber-600">Missing</span>}</span>
                </td>
                <td className="px-4 py-2"><span className="ltr-nums">{loc.crNumber ?? "-"}</span></td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">{loc.status}</span>
                </td>
                <td className="px-4 py-2">
                  <ZatcaCertificateCell locationId={loc.id} hasVatNumber={Boolean(loc.vatNumber)} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(loc)} className="text-xs font-medium text-sky-700 hover:underline">
                      {t("common.edit")}
                    </button>
                    <button onClick={() => setLayoutEditing(loc)} className="text-xs font-medium text-sky-700 hover:underline">
                      Invoice Layout
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">Edit {editing.branchName}</h2>
            <form onSubmit={handleSubmit((v) => updateMutation.mutate(v))} className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Business Name (English)</label>
                <input {...register("businessNameEn")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                {errors.businessNameEn && <p className="mt-1 text-xs text-red-600">{errors.businessNameEn.message}</p>}
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Business Name (Arabic)</label>
                <input {...register("businessNameAr")} dir="rtl" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                {errors.businessNameAr && <p className="mt-1 text-xs text-red-600">{errors.businessNameAr.message}</p>}
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Branch Name</label>
                <input {...register("branchName")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Branch Name (Arabic)</label>
                <input {...register("branchNameAr")} dir="rtl" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Branch Code</label>
                <input {...register("branchCode")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Branch Group</label>
                <div className="flex gap-1">
                  <select {...register("groupId")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    <option value="">None</option>
                    {groups?.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-1 flex gap-1">
                  <input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="New group name"
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    disabled={!newGroupName.trim() || createGroupMutation.isPending}
                    onClick={() => createGroupMutation.mutate(newGroupName.trim())}
                    className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div className="col-span-2 border-t border-slate-200 pt-3">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  VAT Number <span className="text-red-500">*</span>
                </label>
                <input {...register("vatNumber")} placeholder="300000000000003" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                {errors.vatNumber && <p className="mt-1 text-xs text-red-600">{errors.vatNumber.message}</p>}
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">CR Number</label>
                <input {...register("crNumber")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">National Address</label>
                <input {...register("nationalAddress")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Building No.</label>
                <input {...register("buildingNo")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
                <input {...register("city")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">District</label>
                <input {...register("district")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Postal Code</label>
                <input {...register("postalCode")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
                <input {...register("address")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                <input {...register("phone")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("common.email")}</label>
                <input {...register("email")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>

              <div className="col-span-2 border-t border-slate-200 pt-3">
                <label className="mb-1 block text-sm font-medium text-slate-700">Default Price List</label>
                <select {...register("defaultPriceListId")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="">None (catalog price)</option>
                  {priceLists?.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Receipt Printer</label>
                <select {...register("receiptPrinterType")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="browser">Browser-based</option>
                  <option value="printer">Configured printer</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1 flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" {...register("printReceiptOnInvoice")} />
                  Print receipt on invoice
                </label>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Printer Name</label>
                <input {...register("printerName")} placeholder="e.g. Epson TM-T88VI" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">Paper Width (mm)</label>
                <input {...register("paperWidthMm")} type="number" placeholder="e.g. 80" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
              </div>

              <div className="col-span-2 border-t border-slate-200 pt-3">
                <h3 className="mb-2 text-sm font-medium text-slate-700">Document Numbering</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Invoice Prefix</label>
                    <input {...register("invoiceNumberPrefix")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                    {errors.invoiceNumberPrefix && <p className="mt-1 text-xs text-red-600">{errors.invoiceNumberPrefix.message}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Quote Prefix</label>
                    <input {...register("quoteNumberPrefix")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                    {errors.quoteNumberPrefix && <p className="mt-1 text-xs text-red-600">{errors.quoteNumberPrefix.message}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Draft Prefix</label>
                    <input {...register("draftNumberPrefix")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                    {errors.draftNumberPrefix && <p className="mt-1 text-xs text-red-600">{errors.draftNumberPrefix.message}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Credit Note Prefix</label>
                    <input {...register("returnNumberPrefix")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                    {errors.returnNumberPrefix && <p className="mt-1 text-xs text-red-600">{errors.returnNumberPrefix.message}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Reissue Prefix</label>
                    <input {...register("reissueNumberPrefix")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                    {errors.reissueNumberPrefix && <p className="mt-1 text-xs text-red-600">{errors.reissueNumberPrefix.message}</p>}
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      <input type="checkbox" {...register("numberResetYearly")} />
                      Reset yearly
                    </label>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  This does not affect the ZATCA-required ICV sequence, which always runs continuously per branch.
                </p>
              </div>

              {serverError && <p className="col-span-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{serverError}</p>}

              <div className="col-span-2 flex gap-2 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {layoutEditing && <InvoiceLayoutModal location={layoutEditing} onClose={() => setLayoutEditing(null)} />}
    </div>
  );
}

const TEMPLATE_OPTIONS: { value: InvoiceTemplateKey; label: string }[] = [
  { value: "standard", label: "Standard (default)" },
  { value: "thermal58", label: "Thermal 58mm" },
  { value: "thermal80", label: "Thermal 80mm" },
  { value: "a4Full", label: "A4 Full" },
  { value: "a5", label: "A5" },
  { value: "garmentTag", label: "Garment Tag" },
];

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

function InvoiceLayoutModal({ location, onClose }: { location: BusinessLocation; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [templateKey, setTemplateKey] = useState<InvoiceTemplateKey>("standard");
  const [logoUrl, setLogoUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#0284c7");
  const [toggles, setToggles] = useState<ToggleState>(DEFAULT_TOGGLES);
  const [labelDrafts, setLabelDrafts] = useState<Partial<Record<LabelKey, { en: string; ar: string }>>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["invoice-layout", location.id],
    queryFn: async () => (await api.get<ApiSuccess<InvoiceLayoutSettings | null>>(`/business-locations/${location.id}/invoice-layout`)).data.data,
  });

  useEffect(() => {
    if (data === undefined) return;
    setTemplateKey(data?.templateKey ?? "standard");
    setLogoUrl(data?.logoUrl ?? "");
    setAccentColor(data?.accentColor ?? "#0284c7");
    setToggles(
      data
        ? Object.fromEntries(TOGGLE_FIELDS.map((f) => [f.key, data[f.key]])) as ToggleState
        : DEFAULT_TOGGLES,
    );
    setLabelDrafts(data?.labelOverrides ?? {});
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const labelOverrides: Record<string, { en: string; ar: string }> = {};
      for (const key of LABEL_KEYS) {
        const draft = labelDrafts[key];
        if (draft?.en.trim() && draft?.ar.trim()) labelOverrides[key] = { en: draft.en.trim(), ar: draft.ar.trim() };
      }
      return api.put(`/business-locations/${location.id}/invoice-layout`, {
        templateKey,
        logoUrl: logoUrl.trim() || null,
        accentColor,
        ...toggles,
        labelOverrides: Object.keys(labelOverrides).length > 0 ? labelOverrides : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-layout", location.id] });
      setServerError(null);
      onClose();
    },
    onError: (err) => {
      setServerError(isAxiosError(err) ? err.response?.data?.message ?? "Something went wrong" : "Something went wrong");
    },
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Invoice Layout — {location.branchName}</h2>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Template</label>
                <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value as InvoiceTemplateKey)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  {TEMPLATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Accent Color</label>
                <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-9 w-full rounded-md border border-slate-300" />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Logo URL</label>
                <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Fields</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TOGGLE_FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={toggles[f.key]}
                      onChange={(e) => setToggles((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Label Overrides</h3>
              <p className="mb-2 text-[11px] text-slate-400">Leave blank to use the default text shown as a placeholder.</p>
              <div className="max-h-64 space-y-2 overflow-y-auto pe-1">
                {LABEL_KEYS.map((key) => (
                  <div key={key} className="grid grid-cols-2 gap-2">
                    <input
                      value={labelDrafts[key]?.en ?? ""}
                      onChange={(e) => setLabelDrafts((prev) => ({ ...prev, [key]: { en: e.target.value, ar: prev[key]?.ar ?? "" } }))}
                      placeholder={DEFAULT_LABELS[key].en}
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                    <input
                      value={labelDrafts[key]?.ar ?? ""}
                      onChange={(e) => setLabelDrafts((prev) => ({ ...prev, [key]: { en: prev[key]?.en ?? "", ar: e.target.value } }))}
                      placeholder={DEFAULT_LABELS[key].ar}
                      dir="rtl"
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            {serverError && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{serverError}</p>}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
