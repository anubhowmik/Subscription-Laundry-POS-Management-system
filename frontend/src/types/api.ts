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

export interface Customer {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string | null;
  phone: string;
  email: string | null;
  customerGroupId: string | null;
  customerGroup?: CustomerGroup | null;
  priceListId: string | null;
  openingBalance: string;
  balance: string;
  rewardPoints: number;
  cashBack: string;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface Supplier {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string | null;
  phone: string;
  email: string | null;
  vatNumber: string | null;
  creditLimit: string;
  paymentTermsDays: number;
  openingBalance: string;
  balance: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
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
