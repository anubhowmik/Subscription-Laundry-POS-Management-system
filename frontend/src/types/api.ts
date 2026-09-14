export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  message: string;
  errors: { field: string; message: string }[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface BusinessLocation {
  id: string;
  businessNameEn: string;
  businessNameAr: string;
  branchName: string;
  branchNameAr: string | null;
  branchCode: string;
  address: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  buildingNo: string | null;
  phone: string | null;
  email: string | null;
  vatNumber: string | null;
  crNumber: string | null;
  nationalAddress: string | null;
  currency: string;
  timezone: string;
  status: "ACTIVE" | "INACTIVE";
  groupId: string | null;
  group: { nameEn: string; nameAr: string | null } | null;
  defaultPriceListId: string | null;
  defaultPriceList: { nameEn: string; nameAr: string } | null;
  receiptPrinterType: "browser" | "printer";
  printReceiptOnInvoice: boolean;
  printerName: string | null;
  paperWidthMm: number | null;
  invoiceNumberPrefix: string;
  quoteNumberPrefix: string;
  draftNumberPrefix: string;
  returnNumberPrefix: string;
  reissueNumberPrefix: string;
  numberResetYearly: boolean;
}

export type InvoiceTemplateKey = "standard" | "thermal58" | "thermal80" | "a4Full" | "a5" | "garmentTag";

export interface InvoiceLayoutSettings {
  id: string;
  businessLocationId: string;
  name: string;
  isDefault: boolean;
  templateKey: InvoiceTemplateKey;
  logoUrl: string | null;
  accentColor: string | null;
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
  labelOverrides: Record<string, { en: string; ar: string }> | null;
}

export interface BusinessLocationGroup {
  id: string;
  nameEn: string;
  nameAr: string | null;
}

export interface CustomerGroup {
  id: string;
  nameEn: string;
  nameAr: string;
  discountPercent: string;
}

export interface CustomerContactPerson {
  id: string;
  prefix: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  altPhone: string | null;
  familyContactNumber: string | null;
  department: string | null;
  designation: string | null;
}

export interface Customer {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string | null;
  contactType: string;
  prefix: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  businessName: string | null;
  globalCustomer: boolean;
  allowExpeditedDiscount: boolean;
  phone: string;
  altPhone: string | null;
  landline: string | null;
  email: string | null;
  customerGroupId: string | null;
  customerGroup?: CustomerGroup | null;
  defaultAccountId: string | null;
  defaultInvoiceLayoutId: string | null;
  priceListId: string | null;
  address: string | null;
  addressLine2: string | null;
  shippingAddress: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  buildingNo: string | null;
  additionalNo: string | null;
  idType: string | null;
  mapLocation: string | null;
  vatNumber: string | null;
  crNumber: string | null;
  nationalAddress: string | null;
  notes: string | null;
  customField1: string | null;
  customField2: string | null;
  customField3: string | null;
  customField4: string | null;
  customField5: string | null;
  customField6: string | null;
  customField7: string | null;
  customField8: string | null;
  customField9: string | null;
  customField10: string | null;
  creditLimit: string;
  paymentTermsDays: number;
  payTermType: "DAYS" | "MONTHS" | null;
  openingBalance: string;
  balance: string;
  rewardPoints: number;
  cashBack: string;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  contactPersons?: CustomerContactPerson[];
  totalSaleDue?: number;
  totalSellReturnDue?: number;
}

export interface SupplierContactPerson {
  id: string;
  prefix: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  altPhone: string | null;
  familyContactNumber: string | null;
  department: string | null;
  designation: string | null;
}

export interface Supplier {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string | null;
  contactType: string;
  prefix: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  businessName: string | null;
  globalCustomer: boolean;
  allowExpeditedDiscount: boolean;
  defaultAccountId: string | null;
  phone: string;
  altPhone: string | null;
  landline: string | null;
  email: string | null;
  address: string | null;
  addressLine2: string | null;
  shippingAddress: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  buildingNo: string | null;
  additionalNo: string | null;
  idType: string | null;
  mapLocation: string | null;
  vatNumber: string | null;
  crNumber: string | null;
  nationalAddress: string | null;
  notes: string | null;
  customField1: string | null;
  customField2: string | null;
  customField3: string | null;
  customField4: string | null;
  customField5: string | null;
  customField6: string | null;
  customField7: string | null;
  customField8: string | null;
  customField9: string | null;
  customField10: string | null;
  creditLimit: string;
  paymentTermsDays: number;
  payTermType: "DAYS" | "MONTHS" | null;
  openingBalance: string;
  balance: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  /** Computed fresh from Purchase/PurchaseReturn sums, not stored - see supplier.service.ts's
   * attachPurchaseDue(). Matches the reference app's separate "Total Purchase Due"/"Total
   * Purchase Return Due" columns (distinct from `balance`, shown as "Advance Balance"). */
  contactPersons?: SupplierContactPerson[];
  totalPurchaseDue: number;
  totalPurchaseReturnDue: number;
}

export interface Organization {
  id: string;
  nameEn: string;
  nameAr: string;
  slug: string;
  status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
  trialEndsAt: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string | null;
  isSystemAdmin: boolean;
  emailVerified: boolean;
  permissions: string[];
  businessLocations: BusinessLocation[];
  organizationId: string;
  organization: Organization;
}

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

export interface Account {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string | null;
  accountType: AccountType;
  parentAccountId: string | null;
  isSystemAccount: boolean;
  openingBalance: string;
  isActive: boolean;
  balance: number;
  childAccounts?: Account[];
}

export interface JournalLine {
  id: string;
  accountId: string;
  account: Account;
  debit: string;
  credit: string;
  memo: string | null;
}

export interface JournalEntry {
  id: string;
  entryDate: string;
  reference: string | null;
  memo: string | null;
  createdBy: string;
  postedAt: string | null;
  reversalOfId: string | null;
  lines: JournalLine[];
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  nameEn: string;
  nameAr: string | null;
  accountType: AccountType;
  debit: number;
  credit: number;
}

export interface TrialBalanceReport {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
}

export interface BalanceSheetLine {
  code: string;
  nameEn: string;
  nameAr: string | null;
  balance: number;
}

export interface BalanceSheetReport {
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export interface GeneralLedgerRow {
  journalEntryId: string;
  entryDate: string;
  reference: string | null;
  memo: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface GeneralLedgerReport {
  account: { id: string; code: string; nameEn: string; nameAr: string | null; accountType: AccountType };
  openingBalance: number;
  rows: GeneralLedgerRow[];
  closingBalance: number;
}
