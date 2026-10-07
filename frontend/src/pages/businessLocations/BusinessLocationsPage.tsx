import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import type { ApiSuccess, BusinessLocation, BusinessLocationGroup, InvoiceLayoutSettings, InvoiceTemplateKey } from "../../types/api";
import { usePriceLists } from "../../api/posApi";
import { DEFAULT_LABELS, type LabelKey } from "../invoices/invoiceLabels";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { TableExportButtons, ColumnVisibilityMenu } from "../../components/ui/TableToolbarControls";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { LoadingState } from "../../components/ui/Spinner";
import { labelClass, inputClass, selectClass, errorTextClass } from "../../components/ui/formClasses";
import { Building2, CheckCircle2, Pencil, FileText, Power, Landmark } from "lucide-react";
import { LocationPaymentAccountsModal } from "../paymentAccounts/LocationPaymentAccountsModal";
import type { ReactNode } from "react";

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
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BusinessLocation | null>(null);
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [layoutEditing, setLayoutEditing] = useState<BusinessLocation | null>(null);
  const [paymentOptionsFor, setPaymentOptionsFor] = useState<BusinessLocation | null>(null);

  const { data: locations } = useQuery({
    queryKey: ["all-business-locations-admin"],
    queryFn: async () => (await api.get<ApiSuccess<BusinessLocation[]>>("/business-locations", { params: { limit: 100 } })).data.data,
  });

  // A business's branch list is inherently small (capped by the plan's maxBranches) and always
  // fetched in full - no server pagination needed, so sorting/exporting happens client-side over
  // whatever's already loaded, unlike the bigger paginated lists (Suppliers, Sales, etc).
  const [sortBy, setSortBy] = useState<"branchName" | "branchCode">("branchName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field as "branchName" | "branchCode");
      setSortOrder("asc");
    }
  }
  const sortedLocations = [...(locations ?? [])].sort((a, b) => {
    const cmp = a[sortBy].localeCompare(b[sortBy]);
    return sortOrder === "asc" ? cmp : -cmp;
  });

  // Only shown when the plan actually caps branches (null = unlimited) - lets an admin see where
  // they stand and jump straight to upgrading, since there's no "Add Branch" flow that would
  // otherwise surface this the moment they hit the wall.
  const { data: subscriptionInfo } = useQuery({
    queryKey: ["billing-subscription-summary"],
    queryFn: async () => (await api.get<ApiSuccess<{ plan: { nameEn: string; maxBranches: number | null } | null }>>("/billing/subscription")).data.data,
  });
  const maxBranches = subscriptionInfo?.plan?.maxBranches ?? null;
  const activeBranchCount = locations?.filter((l) => l.status === "ACTIVE").length ?? 0;

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

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) =>
      api.post("/business-locations", {
        ...values,
        groupId: values.groupId || null,
        defaultPriceListId: values.defaultPriceListId || null,
        paperWidthMm: values.paperWidthMm ? Number(values.paperWidthMm) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-business-locations-admin"] });
      queryClient.invalidateQueries({ queryKey: ["all-business-locations"] });
      queryClient.invalidateQueries({ queryKey: ["billing-subscription-summary"] });
      setCreating(false);
      setServerError(null);
    },
    onError: (err) => {
      // Surfaces BRANCH_LIMIT_REACHED's message verbatim (see businessLocation.service.ts) if the
      // count changed since the page loaded (e.g. another admin added one in another tab).
      setServerError(isAxiosError(err) ? err.response?.data?.message ?? t("common.somethingWentWrong") : t("common.somethingWentWrong"));
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: "ACTIVE" | "INACTIVE" }) =>
      nextStatus === "INACTIVE" ? api.delete(`/business-locations/${id}`) : api.post(`/business-locations/${id}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-business-locations-admin"] });
      queryClient.invalidateQueries({ queryKey: ["all-business-locations"] });
    },
    onError: (err) => {
      setServerError(isAxiosError(err) ? err.response?.data?.message ?? t("common.somethingWentWrong") : t("common.somethingWentWrong"));
    },
  });

  function openCreate() {
    setCreating(true);
    setEditing(null);
    reset({
      // Prefilled from the org's own name - most businesses register every branch under the
      // same legal name, so this saves retyping it each time. Still editable: Saudi CR/VAT
      // registration does allow a branch to legitimately have its own distinct legal name.
      businessNameEn: user?.organization.nameEn ?? "",
      businessNameAr: user?.organization.nameAr ?? "",
      branchName: "",
      branchNameAr: "",
      branchCode: "",
      address: "",
      city: "",
      district: "",
      postalCode: "",
      buildingNo: "",
      phone: "",
      email: "",
      vatNumber: "",
      crNumber: "",
      nationalAddress: "",
      groupId: "",
      defaultPriceListId: "",
      receiptPrinterType: "browser",
      printReceiptOnInvoice: true,
      printerName: "",
      paperWidthMm: "",
      invoiceNumberPrefix: "INV-",
      quoteNumberPrefix: "QT-",
      draftNumberPrefix: "DFT-",
      returnNumberPrefix: "CN-",
      reissueNumberPrefix: "RE-",
      numberResetYearly: false,
    });
    setServerError(null);
  }

  function openEdit(loc: BusinessLocation) {
    setEditing(loc);
    setCreating(false);
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

  const columns: { key: string; label: string; sortField?: string; render: (loc: BusinessLocation) => ReactNode; exportValue: (loc: BusinessLocation) => string | number | null }[] = [
    { key: "branchName", label: "Branch", sortField: "branchName", render: (loc) => loc.branchName, exportValue: (loc) => loc.branchName },
    { key: "branchCode", label: "Code", sortField: "branchCode", render: (loc) => <span className="ltr-nums">{loc.branchCode}</span>, exportValue: (loc) => loc.branchCode },
    { key: "group", label: "Group", render: (loc) => loc.group?.nameEn ?? "-", exportValue: (loc) => loc.group?.nameEn ?? null },
    {
      key: "vatNumber",
      label: "VAT Number",
      render: (loc) => <span className="ltr-nums">{loc.vatNumber ?? <span className="text-amber-600">Missing</span>}</span>,
      exportValue: (loc) => loc.vatNumber,
    },
    { key: "crNumber", label: "CR Number", render: (loc) => <span className="ltr-nums">{loc.crNumber ?? "-"}</span>, exportValue: (loc) => loc.crNumber },
    {
      key: "status",
      label: t("common.status"),
      render: (loc) => <Badge variant={loc.status === "ACTIVE" ? "success" : "neutral"}>{loc.status}</Badge>,
      exportValue: (loc) => loc.status,
    },
  ];
  const columnVisibility = useColumnVisibility("business-locations", columns.map((c) => c.key));
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Locations"
        subtitle="The VAT number here is required before any invoice can be issued from that location (ZATCA requirement)."
        actions={
          user?.isSystemAdmin && (
            <Button
              size="sm"
              onClick={openCreate}
              disabled={maxBranches !== null && activeBranchCount >= maxBranches}
              title={maxBranches !== null && activeBranchCount >= maxBranches ? "You've reached your plan's branch limit - upgrade to add more" : undefined}
            >
              + Add Branch
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard
          icon={Building2}
          cardBg="bg-app-users-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label="Branches"
          value={String(locations?.length ?? 0)}
        />
        <StatCard
          icon={CheckCircle2}
          cardBg="bg-emerald-50"
          iconBg="bg-emerald-500"
          iconColor="text-white"
          label="Active Branches"
          value={String(activeBranchCount)}
        />
      </div>

      {maxBranches !== null && (
        <Alert variant={activeBranchCount >= maxBranches ? "warning" : "info"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="ltr-nums">
              Using {activeBranchCount} of {maxBranches} branch{maxBranches === 1 ? "" : "es"} on the {subscriptionInfo?.plan?.nameEn} plan.
            </span>
            <Button size="sm" variant="outline" onClick={() => navigate("/billing")}>
              Upgrade for more branches
            </Button>
          </div>
        </Alert>
      )}

      <TableContainer>
        <TableToolbar>
          <div className="ms-auto flex items-center gap-1.5">
            <ColumnVisibilityMenu
              columns={columns.map((c) => ({ key: c.key, label: c.label }))}
              isVisible={columnVisibility.isVisible}
              onToggle={columnVisibility.toggle}
              isAr={false}
            />
            <TableExportButtons
              title="Business Locations"
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => sortedLocations.map((loc) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(loc)])))}
              isAr={false}
            />
          </div>
        </TableToolbar>
        <TableScroll>
          <Table>
            <THead>
              <tr>
                {visibleColumns.map((c) =>
                  c.sortField ? (
                    <SortableTh key={c.key} field={c.sortField} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                      {c.label}
                    </SortableTh>
                  ) : (
                    <Th key={c.key}>{c.label}</Th>
                  ),
                )}
                <Th>{t("common.actions")}</Th>
              </tr>
            </THead>
            <tbody>
              {sortedLocations.map((loc) => (
                <tr key={loc.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {visibleColumns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      {c.render(loc)}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <RowActions>
                      <RowActionButton icon={Pencil} label={t("common.edit")} onClick={() => openEdit(loc)} />
                      <RowActionButton icon={FileText} label="Invoice Layout" onClick={() => setLayoutEditing(loc)} />
                      <RowActionButton icon={Landmark} label={i18n.resolvedLanguage === "ar" ? "خيارات الدفع" : "Payment Options"} onClick={() => setPaymentOptionsFor(loc)} />
                      {user?.isSystemAdmin && (
                        <RowActionButton
                          icon={Power}
                          label={loc.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                          variant={loc.status === "ACTIVE" ? "danger" : "success"}
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: loc.id, nextStatus: loc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}
                        />
                      )}
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      </TableContainer>

      {(editing || creating) && (
        <Modal title={creating ? "Add Branch" : `Edit ${editing!.branchName}`} onClose={() => (creating ? setCreating(false) : setEditing(null))} size="lg">
          <form onSubmit={handleSubmit((v) => (creating ? createMutation.mutate(v) : updateMutation.mutate(v)))} className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Business Name (English)</label>
              <input {...register("businessNameEn")} className={inputClass} />
              {errors.businessNameEn && <p className={errorTextClass}>{errors.businessNameEn.message}</p>}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Business Name (Arabic)</label>
              <input {...register("businessNameAr")} dir="rtl" className={inputClass} />
              {errors.businessNameAr && <p className={errorTextClass}>{errors.businessNameAr.message}</p>}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Branch Name</label>
              <input {...register("branchName")} className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Branch Name (Arabic)</label>
              <input {...register("branchNameAr")} dir="rtl" className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Branch Code</label>
              <input {...register("branchCode")} className={`${inputClass} ltr-nums`} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Branch Group</label>
              <div className="flex gap-1">
                <select {...register("groupId")} className={selectClass}>
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
                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  disabled={!newGroupName.trim() || createGroupMutation.isPending}
                  onClick={() => createGroupMutation.mutate(newGroupName.trim())}
                >
                  + Add
                </Button>
              </div>
            </div>

            <div className="col-span-2 border-t border-slate-200 pt-3">
              <label className={labelClass}>
                VAT Number <span className="text-red-500">*</span>
              </label>
              <input {...register("vatNumber")} placeholder="300000000000003" className={`${inputClass} ltr-nums`} />
              {errors.vatNumber && <p className={errorTextClass}>{errors.vatNumber.message}</p>}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>CR Number</label>
              <input {...register("crNumber")} className={`${inputClass} ltr-nums`} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>National Address</label>
              <input {...register("nationalAddress")} className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Building No.</label>
              <input {...register("buildingNo")} className={`${inputClass} ltr-nums`} />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>City</label>
              <input {...register("city")} className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>District</label>
              <input {...register("district")} className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Postal Code</label>
              <input {...register("postalCode")} className={`${inputClass} ltr-nums`} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Address</label>
              <input {...register("address")} className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Phone</label>
              <input {...register("phone")} className={`${inputClass} ltr-nums`} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>{t("common.email")}</label>
              <input {...register("email")} className={inputClass} />
            </div>

            <div className="col-span-2 border-t border-slate-200 pt-3">
              <label className={labelClass}>Default Price List</label>
              <select {...register("defaultPriceListId")} className={selectClass}>
                <option value="">None (catalog price)</option>
                {priceLists?.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Receipt Printer</label>
              <select {...register("receiptPrinterType")} className={selectClass}>
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
              <label className={labelClass}>Printer Name</label>
              <input {...register("printerName")} placeholder="e.g. Epson TM-T88VI" className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Paper Width (mm)</label>
              <input {...register("paperWidthMm")} type="number" placeholder="e.g. 80" className={`${inputClass} ltr-nums`} />
            </div>

            <div className="col-span-2 border-t border-slate-200 pt-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Document Numbering</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Invoice Prefix</label>
                  <input {...register("invoiceNumberPrefix")} className={`${inputClass} ltr-nums`} />
                  {errors.invoiceNumberPrefix && <p className={errorTextClass}>{errors.invoiceNumberPrefix.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>Quote Prefix</label>
                  <input {...register("quoteNumberPrefix")} className={`${inputClass} ltr-nums`} />
                  {errors.quoteNumberPrefix && <p className={errorTextClass}>{errors.quoteNumberPrefix.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>Draft Prefix</label>
                  <input {...register("draftNumberPrefix")} className={`${inputClass} ltr-nums`} />
                  {errors.draftNumberPrefix && <p className={errorTextClass}>{errors.draftNumberPrefix.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>Credit Note Prefix</label>
                  <input {...register("returnNumberPrefix")} className={`${inputClass} ltr-nums`} />
                  {errors.returnNumberPrefix && <p className={errorTextClass}>{errors.returnNumberPrefix.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>Reissue Prefix</label>
                  <input {...register("reissueNumberPrefix")} className={`${inputClass} ltr-nums`} />
                  {errors.reissueNumberPrefix && <p className={errorTextClass}>{errors.reissueNumberPrefix.message}</p>}
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

            {serverError && (
              <Alert variant="danger" className="col-span-2">
                {serverError}
              </Alert>
            )}

            <div className="col-span-2 flex gap-2 pt-2">
              <Button type="button" variant="outline" fullWidth onClick={() => (creating ? setCreating(false) : setEditing(null))}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" fullWidth disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}>
                {creating ? "Add Branch" : t("common.save")}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {layoutEditing && <InvoiceLayoutModal location={layoutEditing} onClose={() => setLayoutEditing(null)} />}
      {paymentOptionsFor && (
        <LocationPaymentAccountsModal location={paymentOptionsFor} isAr={i18n.resolvedLanguage === "ar"} onClose={() => setPaymentOptionsFor(null)} />
      )}
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
        ? (Object.fromEntries(TOGGLE_FIELDS.map((f) => [f.key, data[f.key]])) as unknown as ToggleState)
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
    <Modal title={`Invoice Layout — ${location.branchName}`} onClose={onClose} size="xl">
      {isLoading ? (
        <LoadingState label="Loading..." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Template</label>
              <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value as InvoiceTemplateKey)} className={selectClass}>
                {TEMPLATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Accent Color</label>
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300" />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Logo URL</label>
              <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." className={inputClass} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Fields</h3>
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
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Label Overrides</h3>
            <p className="mb-2 text-[11px] text-slate-400">Leave blank to use the default text shown as a placeholder.</p>
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

          {serverError && <Alert variant="danger">{serverError}</Alert>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" fullWidth onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" fullWidth onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Save
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
