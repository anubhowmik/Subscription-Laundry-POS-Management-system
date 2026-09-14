import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { Account, ApiSuccess, PaginationMeta, Supplier, SupplierContactPerson } from "../../types/api";
import { formatMoney, formatDate } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { confirmAction } from "../../stores/confirmStore";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { useCountries, useStates, useCities } from "../../hooks/useGeography";
import { SearchInput } from "../../components/ui/SearchInput";
import { labelClass, inputClass, selectClass, textareaClass, helperTextClass } from "../../components/ui/formClasses";
import { IconInput, IconSelect } from "../../components/ui/IconInput";
import { FormSection, RequiredMark } from "../../components/ui/FormSection";
import {
  Truck,
  Plus,
  Trash2,
  IdCard,
  Briefcase,
  Smartphone,
  Phone,
  Mail,
  Info,
  MapPin,
  Banknote,
  Pencil,
  Power,
  User,
  Users,
  FileText,
  BookOpen,
} from "lucide-react";
import type { ReactNode } from "react";

type ContactPersonDraft = Omit<SupplierContactPerson, "id">;
const BLANK_CONTACT_PERSON: ContactPersonDraft = {
  prefix: "",
  firstName: "",
  lastName: "",
  email: "",
  mobile: "",
  altPhone: "",
  familyContactNumber: "",
  department: "",
  designation: "",
};

const ID_TYPE_OPTIONS = ["TIN", "CRN", "MOM", "MLS", "700", "SAG", "NAT", "IQA", "PAS", "OTH"] as const;

interface ContactCustomFieldLabels {
  contactCustomField1Label: string | null;
  contactCustomField2Label: string | null;
  contactCustomField3Label: string | null;
  contactCustomField4Label: string | null;
  contactCustomField5Label: string | null;
  contactCustomField6Label: string | null;
  contactCustomField7Label: string | null;
  contactCustomField8Label: string | null;
  contactCustomField9Label: string | null;
  contactCustomField10Label: string | null;
}

function useCustomFieldLabels(isAr: boolean) {
  const { data } = useQuery({
    queryKey: ["contact-custom-field-labels"],
    queryFn: async () => (await api.get<ApiSuccess<ContactCustomFieldLabels>>("/organizations/custom-field-labels")).data.data,
  });
  return Array.from({ length: 10 }, (_, i) => {
    const key = `contactCustomField${i + 1}Label` as keyof ContactCustomFieldLabels;
    return data?.[key] || (isAr ? `حقل مخصص ${i + 1}` : `Custom Field ${i + 1}`);
  });
}

export default function SuppliersPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [status, setStatus] = useState<"" | "ACTIVE" | "INACTIVE">("");
  // Filter checkboxes matching the EJADA reference's Suppliers list exactly (see
  // supplier.service.ts's list()).
  const [hasPurchaseDue, setHasPurchaseDue] = useState(false);
  const [hasPurchaseReturn, setHasPurchaseReturn] = useState(false);
  const [hasAdvanceBalance, setHasAdvanceBalance] = useState(false);
  const [hasOpeningBalance, setHasOpeningBalance] = useState(false);
  const activeFilterCount =
    (status ? 1 : 0) + (hasPurchaseDue ? 1 : 0) + (hasPurchaseReturn ? 1 : 0) + (hasAdvanceBalance ? 1 : 0) + (hasOpeningBalance ? 1 : 0);
  function clearAllFilters() {
    setStatus("");
    setHasPurchaseDue(false);
    setHasPurchaseReturn(false);
    setHasAdvanceBalance(false);
    setHasOpeningBalance(false);
    setPage(1);
  }
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const customFieldLabels = useCustomFieldLabels(isAr);
  const { data: accounts } = useQuery({
    queryKey: ["accounting-accounts-flat"],
    queryFn: async () => (await api.get<ApiSuccess<Account[]>>("/accounting/accounts")).data.data,
  });
  const flatAccounts = (accounts ?? []).flatMap((a) => [a, ...(a.childAccounts ?? [])]);

  // Sortable column headers matching the reference's DataTable - backend already whitelists
  // these fields (supplier.service.ts's SORTABLE_FIELDS).
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  const columns: { key: string; label: string; sortField?: string; render: (s: Supplier) => ReactNode; exportValue: (s: Supplier) => string | number | null }[] = [
    { key: "code", label: isAr ? "رقم جهة الاتصال" : "Contact ID", render: (s) => <span className="ltr-nums">{s.code}</span>, exportValue: (s) => s.code },
    { key: "businessName", label: isAr ? "اسم النشاط" : "Business Name", render: (s) => s.businessName ?? "-", exportValue: (s) => s.businessName },
    {
      key: "nameEn",
      label: isAr ? "الاسم" : "Name",
      sortField: "nameEn",
      render: (s) => (isAr ? s.nameAr || s.nameEn : s.nameEn),
      exportValue: (s) => (isAr ? s.nameAr || s.nameEn : s.nameEn),
    },
    { key: "phone", label: isAr ? "الجوال" : "Mobile", render: (s) => <span className="ltr-nums">{s.phone}</span>, exportValue: (s) => s.phone },
    { key: "email", label: t("common.email"), render: (s) => s.email ?? "-", exportValue: (s) => s.email },
    { key: "vatNumber", label: isAr ? "الرقم الضريبي" : "Tax number", render: (s) => <span className="ltr-nums">{s.vatNumber ?? "-"}</span>, exportValue: (s) => s.vatNumber },
    {
      key: "address",
      label: isAr ? "العنوان" : "Address",
      render: (s) => [s.address, s.city, s.district].filter(Boolean).join(", ") || "-",
      exportValue: (s) => [s.address, s.city, s.district].filter(Boolean).join(", "),
    },
    {
      key: "paymentTermsDays",
      label: isAr ? "شرط الدفع" : "Pay term",
      render: (s) => (
        <>
          <span className="ltr-nums">{s.paymentTermsDays}</span> {isAr ? "يوم" : "days"}
        </>
      ),
      exportValue: (s) => s.paymentTermsDays,
    },
    { key: "creditLimit", label: isAr ? "حد الائتمان" : "Credit Limit", render: (s) => <span className="ltr-nums">{formatMoney(s.creditLimit, currency, locale)}</span>, exportValue: (s) => Number(s.creditLimit) },
    { key: "openingBalance", label: isAr ? "الرصيد الافتتاحي" : "Opening Balance", render: (s) => <span className="ltr-nums">{formatMoney(s.openingBalance, currency, locale)}</span>, exportValue: (s) => Number(s.openingBalance) },
    {
      key: "balance",
      label: isAr ? "رصيد مقدم" : "Advance Balance",
      sortField: "balance",
      render: (s) => <span className="ltr-nums">{formatMoney(s.balance, currency, locale)}</span>,
      exportValue: (s) => Number(s.balance),
    },
    { key: "totalPurchaseDue", label: isAr ? "إجمالي مستحق الشراء" : "Total Purchase Due", render: (s) => <span className="ltr-nums">{formatMoney(s.totalPurchaseDue, currency, locale)}</span>, exportValue: (s) => s.totalPurchaseDue },
    { key: "totalPurchaseReturnDue", label: isAr ? "إجمالي مرتجع الشراء المستحق" : "Total Purchase Return Due", render: (s) => <span className="ltr-nums">{formatMoney(s.totalPurchaseReturnDue, currency, locale)}</span>, exportValue: (s) => s.totalPurchaseReturnDue },
    {
      key: "createdAt",
      label: isAr ? "أضيف في" : "Added On",
      sortField: "createdAt",
      render: (s) => <span className="ltr-nums">{formatDate(s.createdAt, locale)}</span>,
      exportValue: (s) => formatDate(s.createdAt, locale),
    },
    {
      key: "status",
      label: t("common.status"),
      render: (s) => <Badge variant={s.status === "ACTIVE" ? "success" : "neutral"}>{s.status === "ACTIVE" ? t("common.active") : t("common.inactive")}</Badge>,
      exportValue: (s) => (s.status === "ACTIVE" ? t("common.active") : t("common.inactive")),
    },
    ...Array.from({ length: 10 }, (_, i) => {
      const fieldKey = `customField${i + 1}` as keyof Supplier;
      return {
        key: fieldKey,
        label: customFieldLabels[i],
        render: (s: Supplier) => (s[fieldKey] as string | null) ?? "-",
        exportValue: (s: Supplier) => s[fieldKey] as string | null,
      };
    }),
  ];

  const columnVisibility = useColumnVisibility(
    "suppliers",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    search,
    sortBy,
    sortOrder,
    ...(status ? { status } : {}),
    ...(hasPurchaseDue ? { hasPurchaseDue: "true" } : {}),
    ...(hasPurchaseReturn ? { hasPurchaseReturn: "true" } : {}),
    ...(hasAdvanceBalance ? { hasAdvanceBalance: "true" } : {}),
    ...(hasOpeningBalance ? { hasOpeningBalance: "true" } : {}),
  };

  const { data } = useQuery({
    queryKey: ["suppliers", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Supplier[]>>("/suppliers", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => api.put(`/suppliers/${id}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
  });
  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/suppliers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "الموردون" : "Suppliers"}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> {isAr ? "إضافة مورد" : "Add Supplier"}
          </Button>
        }
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Truck}
            cardBg="bg-sky-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "الموردون" : "Suppliers"}
            value={String(data.meta.total)}
          />
        </div>
      )}

      <TableContainer>
        <TableToolbar>
          <SearchInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("common.search")}
            className="max-w-xs"
          />
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("common.status")}</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as "" | "ACTIVE" | "INACTIVE");
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                <option value="ACTIVE">{t("common.active")}</option>
                <option value="INACTIVE">{t("common.inactive")}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 border-t border-slate-100 pt-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={hasPurchaseDue}
                  onChange={(e) => {
                    setHasPurchaseDue(e.target.checked);
                    setPage(1);
                  }}
                />
                {isAr ? "مستحق الشراء" : "Purchase Due"}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={hasPurchaseReturn}
                  onChange={(e) => {
                    setHasPurchaseReturn(e.target.checked);
                    setPage(1);
                  }}
                />
                {isAr ? "مرتجع الشراء" : "Purchase Return"}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={hasAdvanceBalance}
                  onChange={(e) => {
                    setHasAdvanceBalance(e.target.checked);
                    setPage(1);
                  }}
                />
                {isAr ? "رصيد مقدم" : "Advance Balance"}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={hasOpeningBalance}
                  onChange={(e) => {
                    setHasOpeningBalance(e.target.checked);
                    setPage(1);
                  }}
                />
                {isAr ? "الرصيد الافتتاحي" : "Opening Balance"}
              </label>
            </div>
          </FiltersMenu>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect
              value={limit}
              onChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
            />
            <ColumnVisibilityMenu
              columns={columns.map((c) => ({ key: c.key, label: c.label }))}
              isVisible={columnVisibility.isVisible}
              onToggle={columnVisibility.toggle}
              isAr={isAr}
            />
            <TableExportButtons
              title={isAr ? "الموردون" : "Suppliers"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<Supplier>(async (p, l) => {
                  const res = await api.get<ApiSuccess<Supplier[]>>("/suppliers", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((s) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(s)])));
              }}
              isAr={isAr}
            />
          </div>
        </TableToolbar>
        <TableScroll>
        <Table>
          <THead>
            <tr>
              <Th>{t("common.actions")}</Th>
              {visibleColumns.map((c) =>
                c.sortField ? (
                  <SortableTh key={c.key} field={c.sortField} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                    {c.label}
                  </SortableTh>
                ) : (
                  <Th key={c.key}>{c.label}</Th>
                ),
              )}
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <RowActions align="start">
                    <RowActionButton
                      icon={Pencil}
                      label={t("common.edit")}
                      onClick={() => {
                        setEditing(s);
                        setFormOpen(true);
                      }}
                    />
                    {s.status === "ACTIVE" ? (
                      <RowActionButton
                        icon={Power}
                        label={isAr ? "تعطيل" : "Deactivate"}
                        variant="danger"
                        onClick={async () => {
                          if (await confirmAction({ message: isAr ? `تعطيل "${s.nameEn}"؟` : `Deactivate "${s.nameEn}"?`, danger: true })) {
                            deactivateMutation.mutate(s.id);
                          }
                        }}
                      />
                    ) : (
                      <RowActionButton icon={Power} label={isAr ? "تفعيل" : "Activate"} onClick={() => activateMutation.mutate(s.id)} />
                    )}
                  </RowActions>
                </td>
                {visibleColumns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render(s)}
                  </td>
                ))}
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        </TableScroll>
      </TableContainer>

      {data?.meta && data.meta.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={data.meta.totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          label={`${t("common.page")} ${page} ${t("common.of")} ${data.meta.totalPages}`}
        />
      )}

      {formOpen && (
        <SupplierFormModal
          isAr={isAr}
          editing={editing}
          accounts={flatAccounts}
          onClose={() => setFormOpen(false)}
          onSaved={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}

function SupplierFormModal({
  isAr,
  editing,
  accounts,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  editing: Supplier | null;
  accounts?: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const customFieldLabels = useCustomFieldLabels(isAr);

  // The Suppliers list query doesn't include contactPersons (unnecessary for the table), so an
  // edit fetches the full record separately to get them.
  const { data: fullSupplier } = useQuery({
    queryKey: ["supplier-detail", editing?.id],
    queryFn: async () => (await api.get<ApiSuccess<Supplier>>(`/suppliers/${editing!.id}`)).data.data,
    enabled: !!editing,
  });

  // Plain useState per field (not react-hook-form) - matches CustomerGroupsPage's established
  // create/edit-sharing pattern, which makes prefilling an edit trivial (`editing?.field ?? ""`)
  // without fighting react-hook-form's defaultValues/reset timing.
  const [code, setCode] = useState(editing?.code ?? "");
  const [nameAr, setNameAr] = useState(editing?.nameAr ?? "");
  // Individual/Business radio, converted from the reference exactly (it hides/shows an entirely
  // different set of name fields per type, rather than showing one generic "Name" input) - see
  // schema.prisma's Supplier.contactType comment for why nameEn is computed, not typed directly.
  const [contactType, setContactType] = useState<"individual" | "business">((editing?.contactType as "individual" | "business") ?? "individual");
  const [prefix, setPrefix] = useState(editing?.prefix ?? "");
  // A pre-existing supplier saved before this feature existed has no firstName - fall back to its
  // nameEn so the field isn't blank, and re-saving naturally backfills firstName from then on.
  const [firstName, setFirstName] = useState(editing?.firstName || editing?.nameEn || "");
  const [middleName, setMiddleName] = useState(editing?.middleName ?? "");
  const [lastName, setLastName] = useState(editing?.lastName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(editing?.dateOfBirth ? editing.dateOfBirth.slice(0, 10) : "");
  const [businessName, setBusinessName] = useState(editing?.businessName || (editing?.contactType === "business" ? editing?.nameEn : "") || "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [altPhone, setAltPhone] = useState(editing?.altPhone ?? "");
  const [landline, setLandline] = useState(editing?.landline ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  // Converted from the reference's checkboxes - see schema.prisma's Supplier.globalCustomer
  // comment: saved faithfully, but no downstream system reads them yet in this app.
  const [globalCustomer, setGlobalCustomer] = useState(editing?.globalCustomer ?? false);
  const [allowExpeditedDiscount, setAllowExpeditedDiscount] = useState(editing?.allowExpeditedDiscount ?? false);
  const [defaultAccountId, setDefaultAccountId] = useState(editing?.defaultAccountId ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [addressLine2, setAddressLine2] = useState(editing?.addressLine2 ?? "");
  const [shippingAddress, setShippingAddress] = useState(editing?.shippingAddress ?? "");

  // Country/State/City are cascading dropdowns matching the reference (backed by
  // Country/State/City tables - see useGeography.ts) - Supplier itself still just stores the
  // resolved display name as plain text (unchanged schema), so on edit we resolve that name back
  // to an id once each list loads, to pre-select the right dropdown option.
  const [country, setCountry] = useState(editing?.country ?? "");
  const [state, setState] = useState(editing?.state ?? "");
  const [city, setCity] = useState(editing?.city ?? "");
  const [countryId, setCountryId] = useState("");
  const [stateId, setStateId] = useState("");
  const [cityId, setCityId] = useState("");
  const { data: countries } = useCountries();
  const { data: states } = useStates(countryId || null);
  const { data: cities } = useCities(stateId || null);

  useEffect(() => {
    if (!countryId && country && countries) {
      const match = countries.find((c) => c.nameEn.toLowerCase() === country.toLowerCase() || c.nameAr === country);
      if (match) setCountryId(match.id);
    }
  }, [country, countries, countryId]);

  useEffect(() => {
    if (!stateId && state && states) {
      const match = states.find((s) => s.nameEn.toLowerCase() === state.toLowerCase() || s.nameAr === state);
      if (match) setStateId(match.id);
    }
  }, [state, states, stateId]);

  useEffect(() => {
    if (!cityId && city && cities) {
      const match = cities.find((c) => c.nameEn.toLowerCase() === city.toLowerCase() || c.nameAr === city);
      if (match) setCityId(match.id);
    }
  }, [city, cities, cityId]);

  const [district, setDistrict] = useState(editing?.district ?? "");
  const [postalCode, setPostalCode] = useState(editing?.postalCode ?? "");
  const [buildingNo, setBuildingNo] = useState(editing?.buildingNo ?? "");
  const [additionalNo, setAdditionalNo] = useState(editing?.additionalNo ?? "");
  const [idType, setIdType] = useState(editing?.idType ?? "");
  const [mapLocation, setMapLocation] = useState(editing?.mapLocation ?? "");
  const [nationalAddress, setNationalAddress] = useState(editing?.nationalAddress ?? "");
  const [vatNumber, setVatNumber] = useState(editing?.vatNumber ?? "");
  const [crNumber, setCrNumber] = useState(editing?.crNumber ?? "");
  const [paymentTermsDays, setPaymentTermsDays] = useState(String(editing?.paymentTermsDays ?? 0));
  const [payTermType, setPayTermType] = useState<"" | "DAYS" | "MONTHS">(editing?.payTermType ?? "");
  const [creditLimit, setCreditLimit] = useState(editing?.creditLimit ?? "0");
  const [openingBalance, setOpeningBalance] = useState(editing?.openingBalance ?? "0");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [customFields, setCustomFields] = useState<string[]>(
    Array.from({ length: 10 }, (_, i) => (editing?.[`customField${i + 1}` as keyof Supplier] as string | null) ?? ""),
  );
  const [contactPersons, setContactPersons] = useState<ContactPersonDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fullSupplier?.contactPersons) setContactPersons(fullSupplier.contactPersons);
  }, [fullSupplier]);

  function updateContactPerson(index: number, field: keyof ContactPersonDraft, value: string) {
    setContactPersons((prev) => prev.map((cp, i) => (i === index ? { ...cp, [field]: value } : cp)));
  }

  // nameEn stays the one always-populated display name used everywhere else in the system - see
  // schema.prisma's Supplier.contactType comment. Composed from the individual name-split fields
  // or mirrored from businessName, matching whichever the Individual/Business radio has active.
  const computedNameEn =
    contactType === "individual"
      ? [prefix, firstName, middleName, lastName].filter((v) => v.trim()).join(" ").trim()
      : businessName.trim();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...(code.trim() ? { code: code.trim() } : {}),
        nameEn: computedNameEn,
        nameAr: nameAr || undefined,
        contactType,
        prefix: contactType === "individual" ? prefix || undefined : undefined,
        firstName: contactType === "individual" ? firstName || undefined : undefined,
        middleName: contactType === "individual" ? middleName || undefined : undefined,
        lastName: contactType === "individual" ? lastName || undefined : undefined,
        dateOfBirth: contactType === "individual" ? dateOfBirth || undefined : undefined,
        businessName: contactType === "business" ? businessName || undefined : undefined,
        globalCustomer,
        allowExpeditedDiscount,
        defaultAccountId: defaultAccountId || null,
        phone,
        altPhone: altPhone || undefined,
        landline: landline || undefined,
        email: email || undefined,
        address: address || undefined,
        addressLine2: addressLine2 || undefined,
        shippingAddress: shippingAddress || undefined,
        country: country || undefined,
        state: state || undefined,
        city: city || undefined,
        district: district || undefined,
        postalCode: postalCode || undefined,
        buildingNo: buildingNo || undefined,
        additionalNo: additionalNo || undefined,
        idType: idType || undefined,
        mapLocation: mapLocation || undefined,
        nationalAddress: nationalAddress || undefined,
        vatNumber: vatNumber || undefined,
        crNumber: crNumber || undefined,
        paymentTermsDays: Number(paymentTermsDays || 0),
        payTermType: payTermType || null,
        creditLimit: Number(creditLimit || 0),
        openingBalance: Number(openingBalance || 0),
        notes: notes || undefined,
        ...Object.fromEntries(customFields.map((v, i) => [`customField${i + 1}`, v || undefined])),
        contactPersons: contactPersons
          .filter((cp) => cp.firstName.trim())
          .map((cp) => ({
            prefix: cp.prefix || undefined,
            firstName: cp.firstName,
            lastName: cp.lastName || undefined,
            email: cp.email || undefined,
            mobile: cp.mobile || undefined,
            altPhone: cp.altPhone || undefined,
            familyContactNumber: cp.familyContactNumber || undefined,
            department: cp.department || undefined,
            designation: cp.designation || undefined,
          })),
      };
      if (editing) return api.put(`/suppliers/${editing.id}`, payload);
      return api.post("/suppliers", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      onSaved();
    },
    onError: (err) => {
      setError(isAxiosError(err) ? (err.response?.data?.message ?? t("common.somethingWentWrong")) : t("common.somethingWentWrong"));
    },
  });

  const canSubmit = computedNameEn.trim().length > 0 && phone.trim().length > 0;

  return (
    <Modal title={editing ? (isAr ? "تعديل المورد" : "Edit Supplier") : isAr ? "إضافة مورد" : "Add Supplier"} onClose={onClose} size="2xl">
      <div className="space-y-4">
        <FormSection title={isAr ? "المعلومات الأساسية" : "Basic Information"} icon={User}>
          <div className="mb-4 inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setContactType("individual")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition",
                contactType === "individual" ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <User className="h-3.5 w-3.5" /> {isAr ? "فرد" : "Individual"}
            </button>
            <button
              type="button"
              onClick={() => setContactType("business")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition",
                contactType === "business" ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <Briefcase className="h-3.5 w-3.5" /> {isAr ? "شركة" : "Business"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {contactType === "individual" ? (
              <>
                <div>
                  <label className={labelClass}>{isAr ? "اللقب" : "Prefix"}</label>
                  <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="Mr / Mrs / Miss" autoFocus className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>
                    {isAr ? "الاسم الأول" : "First Name"}
                    <RequiredMark />
                  </label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={isAr ? "الاسم الأول" : "First Name"} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{isAr ? "الاسم الأوسط" : "Middle Name"}</label>
                  <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder={isAr ? "الاسم الأوسط" : "Middle Name"} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{isAr ? "اسم العائلة" : "Last Name"}</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={isAr ? "اسم العائلة" : "Last Name"} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{isAr ? "تاريخ الميلاد" : "Date of Birth"}</label>
                  <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={cn(inputClass, "ltr-nums")} />
                </div>
              </>
            ) : (
              <div>
                <label className={labelClass}>
                  {isAr ? "اسم النشاط التجاري" : "Business Name"}
                  <RequiredMark />
                </label>
                <IconInput icon={Briefcase} value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoFocus placeholder={isAr ? "اسم النشاط التجاري" : "Business Name"} />
              </div>
            )}
            <div>
              <label className={labelClass}>{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</label>
              <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" placeholder={isAr ? "الاسم (عربي)" : "Name (Arabic)"} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "رقم جهة الاتصال" : "Contact ID"}</label>
              <IconInput
                icon={IdCard}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="ltr-nums"
                placeholder={isAr ? "اتركه فارغًا للترقيم التلقائي" : "Leave empty to autogenerate"}
              />
              <p className={helperTextClass}>{isAr ? "اتركه فارغًا للترقيم التلقائي" : "Leave empty to autogenerate"}</p>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الحساب" : "Account"}</label>
              <IconSelect icon={BookOpen} value={defaultAccountId} onChange={(e) => setDefaultAccountId(e.target.value)}>
                <option value="">{isAr ? "بلا" : "None"}</option>
                {accounts?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {isAr ? a.nameAr || a.nameEn : a.nameEn}
                  </option>
                ))}
              </IconSelect>
            </div>
          </div>
        </FormSection>

        <FormSection title={isAr ? "بيانات التواصل" : "Contact Details"} icon={Phone}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                {isAr ? "الجوال" : "Mobile"}
                <RequiredMark />
              </label>
              <IconInput icon={Smartphone} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={isAr ? "الجوال" : "Mobile"} className="ltr-nums" />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "رقم بديل" : "Alternate contact number"}</label>
              <IconInput icon={Phone} value={altPhone} onChange={(e) => setAltPhone(e.target.value)} placeholder={isAr ? "رقم بديل" : "Alternate contact number"} className="ltr-nums" />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الهاتف الأرضي" : "Landline"}</label>
              <IconInput icon={Phone} value={landline} onChange={(e) => setLandline(e.target.value)} placeholder={isAr ? "الهاتف الأرضي" : "Landline"} className="ltr-nums" />
            </div>
            <div>
              <label className={labelClass}>{t("common.email")}</label>
              <IconInput icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("common.email")} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <label className="flex cursor-pointer flex-col gap-0.5 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50">
              <span className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={globalCustomer} onChange={(e) => setGlobalCustomer(e.target.checked)} />
                {isAr ? "عميل عام" : "Global Customer"}
              </span>
              <span className="ps-5 text-xs text-slate-400">
                {isAr ? "لا يوجد نظام تقييد رؤية حسب الفرع بعد، فليس له أثر حاليًا" : "No location-scoped visibility restriction exists yet, so this has no effect yet"}
              </span>
            </label>
            <label className="flex cursor-pointer flex-col gap-0.5 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50">
              <span className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={allowExpeditedDiscount} onChange={(e) => setAllowExpeditedDiscount(e.target.checked)} />
                {isAr ? "السماح بخصم السداد المعجل" : "Allow Expedited Discount"}
              </span>
              <span className="ps-5 text-xs text-slate-400">
                {isAr ? "لا يوجد نظام خصم السداد المبكر بعد، فليس له أثر حاليًا" : "No early-payment discount system exists yet, so this has no effect yet"}
              </span>
            </label>
          </div>
        </FormSection>

        <FormSection title={isAr ? "العنوان" : "Address"} icon={MapPin}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "العنوان (سطر 1)" : "Address Line 1"}</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={isAr ? "العنوان (سطر 1)" : "Address Line 1"} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "العنوان (سطر 2)" : "Address Line 2"}</label>
              <input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder={isAr ? "العنوان (سطر 2)" : "Address Line 2"} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>{isAr ? "عنوان الشحن" : "Shipping Address"}</label>
              <textarea
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                placeholder={isAr ? "عنوان الشحن (إن اختلف عن عنوان الفوترة)" : "Shipping address (if different from billing address)"}
                rows={2}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الدولة" : "Country"}</label>
              <select
                value={countryId}
                onChange={(e) => {
                  const id = e.target.value;
                  setCountryId(id);
                  setStateId("");
                  setCityId("");
                  setState("");
                  setCity("");
                  const match = countries?.find((c) => c.id === id);
                  setCountry(match ? (isAr && match.nameAr ? match.nameAr : match.nameEn) : "");
                }}
                className={selectClass}
              >
                <option value="">{isAr ? "اختر الدولة" : "Select Country"}</option>
                {countries?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isAr && c.nameAr ? c.nameAr : c.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "المنطقة" : "State"}</label>
              <select
                value={stateId}
                onChange={(e) => {
                  const id = e.target.value;
                  setStateId(id);
                  setCityId("");
                  setCity("");
                  const match = states?.find((s) => s.id === id);
                  setState(match ? (isAr && match.nameAr ? match.nameAr : match.nameEn) : "");
                }}
                disabled={!countryId}
                className={selectClass}
              >
                <option value="">{isAr ? "اختر المنطقة" : "Select State"}</option>
                {states?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {isAr && s.nameAr ? s.nameAr : s.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "المدينة" : "City"}</label>
              <select
                value={cityId}
                onChange={(e) => {
                  const id = e.target.value;
                  setCityId(id);
                  const match = cities?.find((c) => c.id === id);
                  setCity(match ? (isAr && match.nameAr ? match.nameAr : match.nameEn) : "");
                }}
                disabled={!stateId}
                className={selectClass}
              >
                <option value="">{isAr ? "اختر المدينة" : "Select City"}</option>
                {cities?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isAr && c.nameAr ? c.nameAr : c.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الحي" : "District"}</label>
              <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder={isAr ? "الحي" : "District"} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الرمز البريدي" : "Zip Code"}</label>
              <IconInput icon={MapPin} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder={isAr ? "الرمز البريدي" : "Zip/Postal Code"} className="ltr-nums" />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "رقم المبنى" : "Building Number"}</label>
              <input value={buildingNo} onChange={(e) => setBuildingNo(e.target.value)} placeholder={isAr ? "رقم المبنى" : "Building Number"} className={cn(inputClass, "ltr-nums")} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الرقم الإضافي" : "Additional Number"}</label>
              <input value={additionalNo} onChange={(e) => setAdditionalNo(e.target.value)} placeholder={isAr ? "الرقم الإضافي" : "Additional Number"} className={cn(inputClass, "ltr-nums")} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "نوع الهوية" : "ID Type"}</label>
              <select value={idType} onChange={(e) => setIdType(e.target.value)} className={selectClass}>
                <option value="">{isAr ? "اختر" : "Select"}</option>
                {ID_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الموقع (خط الطول والعرض)" : "Map Location"}</label>
              <input value={mapLocation} onChange={(e) => setMapLocation(e.target.value)} placeholder="format: lat,lng" className={cn(inputClass, "ltr-nums")} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>{isAr ? "العنوان الوطني" : "National Address"}</label>
              <input value={nationalAddress} onChange={(e) => setNationalAddress(e.target.value)} placeholder={isAr ? "العنوان الوطني" : "National Address"} className={inputClass} />
            </div>
          </div>
        </FormSection>

        <FormSection title={isAr ? "الضرائب والسجل التجاري" : "Tax & Registration"} icon={Info}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "الرقم الضريبي" : "Tax number"}</label>
              <IconInput icon={Info} value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder={isAr ? "الرقم الضريبي" : "Tax number"} className="ltr-nums" />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "السجل التجاري" : "Commercial Register"}</label>
              <IconInput icon={Info} value={crNumber} onChange={(e) => setCrNumber(e.target.value)} placeholder={isAr ? "السجل التجاري" : "Commercial Register"} className="ltr-nums" />
            </div>
          </div>
        </FormSection>

        <FormSection
          title={isAr ? "تفاصيل إضافية" : "More Details"}
          description={isAr ? "شروط الدفع، حد الائتمان، الرصيد الافتتاحي، الحقول المخصصة" : "Payment terms, credit limit, opening balance, custom fields"}
          icon={Banknote}
          collapsible
          defaultOpen={false}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "شرط الدفع" : "Pay term"}</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(e.target.value)}
                  className={cn(inputClass, "ltr-nums w-1/2")}
                />
                <select value={payTermType} onChange={(e) => setPayTermType(e.target.value as typeof payTermType)} className={cn(inputClass, "w-1/2")}>
                  <option value="">{isAr ? "اختر" : "Please Select"}</option>
                  <option value="DAYS">{isAr ? "أيام" : "Days"}</option>
                  <option value="MONTHS">{isAr ? "أشهر" : "Months"}</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "حد الائتمان" : "Credit Limit"}</label>
              <IconInput icon={Banknote} type="number" min={0} step="0.01" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="0.00" className="ltr-nums" />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الرصيد الافتتاحي" : "Opening Balance"}</label>
              <IconInput icon={Banknote} type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="ltr-nums" />
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{isAr ? "حقول مخصصة" : "Custom Fields"}</p>
            <div className="grid grid-cols-2 gap-3">
              {customFieldLabels.map((label, i) => (
                <div key={i}>
                  <label className={labelClass}>{label}</label>
                  <input
                    value={customFields[i]}
                    onChange={(e) =>
                      setCustomFields((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                    placeholder={label}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>
        </FormSection>

        <FormSection
          title={isAr ? "أشخاص التواصل" : "Contact Persons"}
          icon={Users}
          collapsible
          defaultOpen={contactPersons.length > 0}
          badge={contactPersons.length > 0 && <Badge variant="neutral">{contactPersons.length}</Badge>}
          actions={
            <Button type="button" size="sm" variant="outline" onClick={() => setContactPersons((prev) => [...prev, { ...BLANK_CONTACT_PERSON }])}>
              <Plus className="me-1 h-3.5 w-3.5" /> {isAr ? "إضافة" : "Add"}
            </Button>
          }
        >
          <div className="space-y-4">
            {contactPersons.map((cp, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">{isAr ? `شخص التواصل ${i + 1}` : `Contact Person ${i + 1}`}</p>
                  <button type="button" onClick={() => setContactPersons((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>{isAr ? "اللقب" : "Prefix"}</label>
                    <input value={cp.prefix ?? ""} onChange={(e) => updateContactPerson(i, "prefix", e.target.value)} placeholder="Mr / Mrs / Miss" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>{isAr ? "الاسم الأول" : "First Name"}</label>
                    <input value={cp.firstName} onChange={(e) => updateContactPerson(i, "firstName", e.target.value)} placeholder={isAr ? "الاسم الأول" : "First Name"} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>{isAr ? "اسم العائلة" : "Last Name"}</label>
                    <input value={cp.lastName ?? ""} onChange={(e) => updateContactPerson(i, "lastName", e.target.value)} placeholder={isAr ? "اسم العائلة" : "Last Name"} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>{t("common.email")}</label>
                    <input value={cp.email ?? ""} onChange={(e) => updateContactPerson(i, "email", e.target.value)} placeholder={t("common.email")} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>{isAr ? "الجوال" : "Mobile Number"}</label>
                    <input value={cp.mobile ?? ""} onChange={(e) => updateContactPerson(i, "mobile", e.target.value)} placeholder={isAr ? "الجوال" : "Mobile Number"} className={cn(inputClass, "ltr-nums")} />
                  </div>
                  <div>
                    <label className={labelClass}>{isAr ? "رقم بديل" : "Alternate contact number"}</label>
                    <input value={cp.altPhone ?? ""} onChange={(e) => updateContactPerson(i, "altPhone", e.target.value)} placeholder={isAr ? "رقم بديل" : "Alternate contact number"} className={cn(inputClass, "ltr-nums")} />
                  </div>
                  <div>
                    <label className={labelClass}>{isAr ? "رقم تواصل العائلة" : "Family contact number"}</label>
                    <input value={cp.familyContactNumber ?? ""} onChange={(e) => updateContactPerson(i, "familyContactNumber", e.target.value)} placeholder={isAr ? "رقم تواصل العائلة" : "Family contact number"} className={cn(inputClass, "ltr-nums")} />
                  </div>
                  <div>
                    <label className={labelClass}>{isAr ? "القسم" : "Department"}</label>
                    <input value={cp.department ?? ""} onChange={(e) => updateContactPerson(i, "department", e.target.value)} placeholder={isAr ? "القسم" : "Department"} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>{isAr ? "المسمى الوظيفي" : "Designation"}</label>
                    <input value={cp.designation ?? ""} onChange={(e) => updateContactPerson(i, "designation", e.target.value)} placeholder={isAr ? "المسمى الوظيفي" : "Designation"} className={inputClass} />
                  </div>
                </div>
              </div>
            ))}
            {contactPersons.length === 0 && <p className="text-xs text-slate-400">{isAr ? "لم تتم إضافة أي شخص تواصل بعد" : "No contact persons added yet"}</p>}
          </div>
        </FormSection>

        <FormSection title={t("common.notes")} icon={FileText} collapsible defaultOpen={!!notes}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={textareaClass} />
        </FormSection>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" fullWidth onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" fullWidth disabled={!canSubmit || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
