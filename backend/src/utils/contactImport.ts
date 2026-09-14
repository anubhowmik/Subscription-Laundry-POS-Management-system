/**
 * Shared row-parsing for the Customers/Suppliers "Import Contacts" feature (see
 * customer.service.ts's importCustomers / supplier.service.ts's importSuppliers) - both entities
 * share almost the exact same column set (the reference's own Contact model backs both), so the
 * parsing/validation for one row lives here once instead of twice.
 *
 * Converted field-by-field from the reference's `ContactController::postImportContacts()` 35-column
 * spec (see `contact/import.blade.php`'s instructions table) - see each field's comment below for
 * where it maps to (or deliberately departs from) the reference column of the same concept.
 */

// Canonical header -> field key. Column ORDER in the uploaded file doesn't matter (see
// mapSheetRows in spreadsheet.ts) - only that these header labels are present, matched
// case-insensitively. This is also the exact header row generated for the downloadable template
// on the frontend (ImportContactsPage.tsx) - keep the two in sync.
export const CONTACT_HEADER_MAP: Record<string, string> = {
  code: "code",
  "individual/business": "contactTypeRaw",
  prefix: "prefix",
  "first name": "firstName",
  "middle name": "middleName",
  "last name": "lastName",
  "business name": "businessName",
  "name (arabic)": "nameAr",
  phone: "phone",
  "alt phone": "altPhone",
  landline: "landline",
  email: "email",
  address: "address",
  "address line 2": "addressLine2",
  city: "city",
  district: "district",
  state: "state",
  country: "country",
  "postal code": "postalCode",
  "building no": "buildingNo",
  "additional no": "additionalNo",
  "id type": "idTypeRaw",
  "vat number": "vatNumber",
  "cr number": "crNumber",
  "national address": "nationalAddress",
  "date of birth": "dateOfBirthRaw",
  "credit limit": "creditLimit",
  "payment terms (days)": "paymentTermsDays",
  "opening balance": "openingBalance",
  notes: "notes",
  "business location": "businessLocationName",
  "custom field 1": "customField1",
  "custom field 2": "customField2",
  "custom field 3": "customField3",
  "custom field 4": "customField4",
  "custom field 5": "customField5",
  "custom field 6": "customField6",
  "custom field 7": "customField7",
  "custom field 8": "customField8",
  "custom field 9": "customField9",
  "custom field 10": "customField10",
};

// Customer-only columns - the reference's own Contact model keeps these under the shared table,
// but they only make sense for a customer here (Supplier has no CustomerGroup/PriceList/
// InvoiceLayoutSettings concept), so these stay separate constants merged in only by
// customer.service.ts's importCustomers(), same as the pre-existing CUSTOMER_GROUP_HEADER.
export const CUSTOMER_GROUP_HEADER = "customer group";
export const PRICE_LIST_HEADER = "selling price group";
export const INVOICE_LAYOUT_HEADER = "invoice layout";

const ID_TYPES = ["TIN", "CRN", "MOM", "MLS", "700", "SAG", "NAT", "IQA", "PAS", "OTH"];
const SAUDI_PHONE_RE = /^(?:\+?966|0)5\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedContactRow {
  code?: string;
  contactType: "individual" | "business";
  prefix?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  businessName?: string;
  /** Computed from contactType + name parts, exactly like the manual create/edit form's
   * `computedNameEn` (never a directly-imported column - the reference has no direct "name"
   * column either, it's always built from the prefix/first/middle/last or business-name parts). */
  nameEn: string;
  nameAr?: string;
  phone: string;
  altPhone?: string;
  landline?: string;
  email?: string;
  address?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  buildingNo?: string;
  additionalNo?: string;
  idType: string;
  vatNumber?: string;
  crNumber?: string;
  nationalAddress?: string;
  dateOfBirth?: Date;
  creditLimit: number;
  paymentTermsDays: number;
  openingBalance: number;
  notes?: string;
  /** Raw name cells, if the column was present - resolved to ids by the caller (each entity type
   * resolves whichever of these actually apply to it). */
  businessLocationName?: string;
  customerGroupName?: string;
  priceListName?: string;
  invoiceLayoutName?: string;
  customField1?: string;
  customField2?: string;
  customField3?: string;
  customField4?: string;
  customField5?: string;
  customField6?: string;
  customField7?: string;
  customField8?: string;
  customField9?: string;
  customField10?: string;
}

function parseNumberField(raw: string | undefined, rowNumber: number, label: string): number | string {
  if (!raw || raw.trim() === "") return 0;
  const n = Number(raw);
  if (Number.isNaN(n)) return `Row ${rowNumber}: "${label}" must be a number (got "${raw}")`;
  return n;
}

/** Returns either the parsed row or a human-readable error string - never both. */
export function parseContactRow(raw: Record<string, string>, rowNumber: number): { data: ParsedContactRow } | { error: string } {
  // Individual/Business - converted from the reference's "Is business" 1/0 column, using the same
  // readable Individual/Business values the manual create form's own toggle already writes/reads
  // (CustomerGroup.contactType) rather than a bare boolean flag.
  const contactTypeRaw = (raw.contactTypeRaw ?? "").trim().toLowerCase();
  const contactType: "individual" | "business" = contactTypeRaw === "business" ? "business" : "individual";

  const prefix = raw.prefix?.trim() || undefined;
  const firstName = raw.firstName?.trim() || undefined;
  const middleName = raw.middleName?.trim() || undefined;
  const lastName = raw.lastName?.trim() || undefined;
  const businessName = raw.businessName?.trim() || undefined;

  // Required-if-type, matching the manual form's own `computedNameEn` requirement exactly
  // (CustomersPage.tsx/SuppliersPage.tsx) - NOT the reference's own literal "First Name is always
  // required regardless of type" rule, which would conflict with the Business Name Individual/
  // Business toggle this app already built for real (Round 8) and hides First Name entirely in
  // Business mode.
  let nameEn: string;
  if (contactType === "business") {
    if (!businessName) return { error: `Row ${rowNumber}: "Business Name" is required when Individual/Business is "Business"` };
    nameEn = businessName;
  } else {
    if (!firstName) return { error: `Row ${rowNumber}: "First Name" is required when Individual/Business is "Individual"` };
    nameEn = [prefix, firstName, middleName, lastName].filter(Boolean).join(" ").trim();
  }

  const phone = (raw.phone ?? "").trim();
  if (!phone) return { error: `Row ${rowNumber}: "Phone" is required` };
  if (!SAUDI_PHONE_RE.test(phone)) {
    return { error: `Row ${rowNumber}: "${phone}" is not a valid Saudi phone number (e.g. 05XXXXXXXX)` };
  }

  const email = raw.email?.trim();
  if (email && !EMAIL_RE.test(email)) return { error: `Row ${rowNumber}: "${email}" is not a valid email` };

  // Reference's "other_id" field - same TIN/CRN/MOM/MLS/700/SAG/NAT/IQA/PAS/OTH set the manual
  // create/edit form's own ID Type dropdown already uses, defaulting to TIN when blank exactly
  // like the reference's own `!empty($value[33]) ? $value[33] : 'TIN'`.
  const idTypeRaw = raw.idTypeRaw?.trim().toUpperCase();
  const idType = idTypeRaw || "TIN";
  if (!ID_TYPES.includes(idType)) {
    return { error: `Row ${rowNumber}: "ID Type" must be one of ${ID_TYPES.join(", ")} (got "${idTypeRaw}")` };
  }

  let dateOfBirth: Date | undefined;
  const dobRaw = raw.dateOfBirthRaw?.trim();
  if (dobRaw) {
    if (!DATE_RE.test(dobRaw)) return { error: `Row ${rowNumber}: "Date of Birth" must be in YYYY-MM-DD format (got "${dobRaw}")` };
    const parsedDob = new Date(dobRaw);
    if (Number.isNaN(parsedDob.getTime())) return { error: `Row ${rowNumber}: "Date of Birth" is not a valid date (got "${dobRaw}")` };
    dateOfBirth = parsedDob;
  }

  const creditLimit = parseNumberField(raw.creditLimit, rowNumber, "Credit Limit");
  if (typeof creditLimit === "string") return { error: creditLimit };
  const paymentTermsDaysRaw = parseNumberField(raw.paymentTermsDays, rowNumber, "Payment Terms (Days)");
  if (typeof paymentTermsDaysRaw === "string") return { error: paymentTermsDaysRaw };
  const openingBalance = parseNumberField(raw.openingBalance, rowNumber, "Opening Balance");
  if (typeof openingBalance === "string") return { error: openingBalance };

  return {
    data: {
      code: raw.code?.trim() || undefined,
      contactType,
      prefix,
      firstName,
      middleName,
      lastName,
      businessName,
      nameEn,
      nameAr: raw.nameAr?.trim() || undefined,
      phone,
      altPhone: raw.altPhone?.trim() || undefined,
      landline: raw.landline?.trim() || undefined,
      email: email || undefined,
      address: raw.address?.trim() || undefined,
      addressLine2: raw.addressLine2?.trim() || undefined,
      city: raw.city?.trim() || undefined,
      district: raw.district?.trim() || undefined,
      state: raw.state?.trim() || undefined,
      country: raw.country?.trim() || undefined,
      postalCode: raw.postalCode?.trim() || undefined,
      buildingNo: raw.buildingNo?.trim() || undefined,
      additionalNo: raw.additionalNo?.trim() || undefined,
      idType,
      vatNumber: raw.vatNumber?.trim() || undefined,
      crNumber: raw.crNumber?.trim() || undefined,
      nationalAddress: raw.nationalAddress?.trim() || undefined,
      dateOfBirth,
      creditLimit,
      paymentTermsDays: Math.trunc(paymentTermsDaysRaw),
      openingBalance,
      notes: raw.notes?.trim() || undefined,
      businessLocationName: raw.businessLocationName?.trim() || undefined,
      customerGroupName: raw.customerGroupName?.trim() || undefined,
      priceListName: raw.priceListName?.trim() || undefined,
      invoiceLayoutName: raw.invoiceLayoutName?.trim() || undefined,
      customField1: raw.customField1?.trim() || undefined,
      customField2: raw.customField2?.trim() || undefined,
      customField3: raw.customField3?.trim() || undefined,
      customField4: raw.customField4?.trim() || undefined,
      customField5: raw.customField5?.trim() || undefined,
      customField6: raw.customField6?.trim() || undefined,
      customField7: raw.customField7?.trim() || undefined,
      customField8: raw.customField8?.trim() || undefined,
      customField9: raw.customField9?.trim() || undefined,
      customField10: raw.customField10?.trim() || undefined,
    },
  };
}
