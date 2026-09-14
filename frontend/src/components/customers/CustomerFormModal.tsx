import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import {
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
  User,
  FileText,
  UsersRound,
  Tag,
  BookOpen,
  LayoutTemplate,
} from "lucide-react";
import { api } from "../../api/client";
import type { Account, ApiSuccess, Customer, CustomerContactPerson, InvoiceLayoutSettings } from "../../types/api";
import { cn } from "../../lib/cn";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { usePriceLists } from "../../api/posApi";
import { useCountries, useStates, useCities } from "../../hooks/useGeography";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { Alert } from "../ui/Alert";
import { labelClass, inputClass, selectClass, textareaClass, helperTextClass } from "../ui/formClasses";
import { IconInput, IconSelect } from "../ui/IconInput";
import { FormSection, RequiredMark } from "../ui/FormSection";

type ContactPersonDraft = Omit<CustomerContactPerson, "id">;
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

interface CustomerGroupOption {
  id: string;
  nameEn: string;
  nameAr: string | null;
}

function useCustomerGroups() {
  return useQuery({
    queryKey: ["customer-groups", "all"],
    queryFn: async () => (await api.get<ApiSuccess<CustomerGroupOption[]>>("/customer-groups", { params: { limit: 100 } })).data.data,
  });
}

interface Props {
  isAr: boolean;
  editing: Customer | null;
  onClose: () => void;
  /** Passes the newly created customer back (create only, undefined on edit) - used by the
   * POS/Add Sale "+ New customer" flow to select it into the cart immediately, matching the
   * reference's own quick-add-then-auto-select behavior. */
  onSaved: (created?: Customer) => void;
}

/**
 * The full Add/Edit Customer form (`contact/create.blade.php`, converted field-by-field across
 * many earlier rounds of this rebuild) - extracted out of `CustomersPage.tsx` so it can be
 * reused verbatim wherever the reference itself reuses its OWN contact form: from the POS/Add
 * Sale "+ New customer" button (`contact_modal` in `sell/create.blade.php`, literally
 * `@include('contact.create', ['quick_add' => true])` - the SAME form, not a separate simplified
 * template). Self-fetches every dropdown's options (customer groups, price lists, accounts,
 * invoice layouts) so it can be dropped into any page without that page needing to wire up the
 * same queries first - matching the same self-contained pattern `ProductFormModal.tsx`/
 * `ServiceFormModal.tsx` already use. `CustomersPage.tsx` keeps its own separate fetches of
 * customer groups/price lists for its OWN filters/columns; those and this modal's internal
 * fetches share one React Query cache entry per key, so nothing is fetched twice.
 *
 * A few reference fields are still deliberately not built (unchanged from earlier rounds, not
 * reconsidered here): CRM lead fields, shipping custom fields 1-5, export fields, Contact
 * Properties multi-select, Google-Maps picker for Map Location, "Allow login" portal-account
 * fields on Contact Persons - each ties to a vertical/subsystem this app doesn't have.
 */
export function CustomerFormModal({ isAr, editing, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { currentLocation } = useBusinessLocation();
  const customFieldLabels = useCustomFieldLabels(isAr);
  const { data: customerGroups } = useCustomerGroups();
  const { data: priceLists } = usePriceLists();
  const { data: accountsRaw } = useQuery({
    queryKey: ["accounting-accounts-flat"],
    queryFn: async () => (await api.get<ApiSuccess<Account[]>>("/accounting/accounts")).data.data,
  });
  const accounts = (accountsRaw ?? []).flatMap((a) => [a, ...(a.childAccounts ?? [])]);
  const { data: invoiceLayouts } = useQuery({
    queryKey: ["invoice-layouts", currentLocation?.id],
    queryFn: async () =>
      (await api.get<ApiSuccess<InvoiceLayoutSettings[]>>("/invoice-layouts", { params: { businessLocationId: currentLocation!.id } })).data.data,
    enabled: !!currentLocation,
  });

  // The Customers list query doesn't include contactPersons (unnecessary for the table), so an
  // edit fetches the full record separately to get them.
  const { data: fullCustomer } = useQuery({
    queryKey: ["customer-detail", editing?.id],
    queryFn: async () => (await api.get<ApiSuccess<Customer>>(`/customers/${editing!.id}`)).data.data,
    enabled: !!editing,
  });

  const [code, setCode] = useState(editing?.code ?? "");
  const [nameAr, setNameAr] = useState(editing?.nameAr ?? "");
  const [contactType, setContactType] = useState<"individual" | "business">((editing?.contactType as "individual" | "business") ?? "individual");
  const [prefix, setPrefix] = useState(editing?.prefix ?? "");
  const [firstName, setFirstName] = useState(editing?.firstName || editing?.nameEn || "");
  const [middleName, setMiddleName] = useState(editing?.middleName ?? "");
  const [lastName, setLastName] = useState(editing?.lastName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(editing?.dateOfBirth ? editing.dateOfBirth.slice(0, 10) : "");
  const [businessName, setBusinessName] = useState(editing?.businessName || (editing?.contactType === "business" ? editing?.nameEn : "") || "");
  const [customerGroupId, setCustomerGroupId] = useState(editing?.customerGroupId ?? "");
  const [priceListId, setPriceListId] = useState(editing?.priceListId ?? "");
  const [defaultAccountId, setDefaultAccountId] = useState(editing?.defaultAccountId ?? "");
  const [defaultInvoiceLayoutId, setDefaultInvoiceLayoutId] = useState(editing?.defaultInvoiceLayoutId ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [altPhone, setAltPhone] = useState(editing?.altPhone ?? "");
  const [landline, setLandline] = useState(editing?.landline ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [globalCustomer, setGlobalCustomer] = useState(editing?.globalCustomer ?? false);
  const [allowExpeditedDiscount, setAllowExpeditedDiscount] = useState(editing?.allowExpeditedDiscount ?? false);
  const [address, setAddress] = useState(editing?.address ?? "");
  const [addressLine2, setAddressLine2] = useState(editing?.addressLine2 ?? "");
  const [shippingAddress, setShippingAddress] = useState(editing?.shippingAddress ?? "");

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
    Array.from({ length: 10 }, (_, i) => (editing?.[`customField${i + 1}` as keyof Customer] as string | null) ?? ""),
  );
  const [contactPersons, setContactPersons] = useState<ContactPersonDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fullCustomer?.contactPersons) setContactPersons(fullCustomer.contactPersons);
  }, [fullCustomer]);

  function updateContactPerson(index: number, field: keyof ContactPersonDraft, value: string) {
    setContactPersons((prev) => prev.map((cp, i) => (i === index ? { ...cp, [field]: value } : cp)));
  }

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
        customerGroupId: customerGroupId || null,
        priceListId: priceListId || null,
        defaultAccountId: defaultAccountId || null,
        defaultInvoiceLayoutId: defaultInvoiceLayoutId || null,
        globalCustomer,
        allowExpeditedDiscount,
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
      if (editing) {
        await api.put(`/customers/${editing.id}`, payload);
        return undefined;
      }
      const created = await api.post<ApiSuccess<Customer>>("/customers", payload);
      return created.data.data;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      onSaved(created);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? (err.response?.data?.message ?? t("common.somethingWentWrong")) : t("common.somethingWentWrong"));
    },
  });

  const canSubmit = computedNameEn.trim().length > 0 && phone.trim().length > 0;

  return (
    <Modal title={editing ? (isAr ? "تعديل العميل" : "Edit Customer") : t("customers.addCustomer")} onClose={onClose} size="2xl">
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
              <label className={labelClass}>{t("customers.group")}</label>
              <IconSelect icon={UsersRound} value={customerGroupId} onChange={(e) => setCustomerGroupId(e.target.value)}>
                <option value="">{isAr ? "بلا" : "None"}</option>
                {customerGroups?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {isAr ? g.nameAr || g.nameEn : g.nameEn}
                  </option>
                ))}
              </IconSelect>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "قائمة الأسعار" : "Selling Price Group"}</label>
              <IconSelect icon={Tag} value={priceListId} onChange={(e) => setPriceListId(e.target.value)}>
                <option value="">{isAr ? "بلا" : "None"}</option>
                {priceLists?.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {isAr ? pl.nameAr || pl.nameEn : pl.nameEn}
                  </option>
                ))}
              </IconSelect>
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
            <div>
              <label className={labelClass}>{isAr ? "تخطيط الفاتورة" : "Invoice Layout for Sale"}</label>
              <IconSelect icon={LayoutTemplate} value={defaultInvoiceLayoutId} onChange={(e) => setDefaultInvoiceLayoutId(e.target.value)}>
                <option value="">{isAr ? "بلا (افتراضي الفرع)" : "None (branch default)"}</option>
                {invoiceLayouts?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
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
          icon={UsersRound}
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
