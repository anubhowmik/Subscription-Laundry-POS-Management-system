import type { InvoiceLayoutSettings } from "../../types/api";

export interface SaleItemDetail {
  id: string;
  descriptionEn: string;
  descriptionAr: string | null;
  quantity: string;
  unitPrice: string;
  taxPercent: string;
  taxAmount: string;
  discountAmount: string;
  subtotal: string;
  total: string;
  product: { sku: string } | null;
  service: { code: string } | null;
}

export interface SaleDetail {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  estimatedReadyAt: string | null;
  icv: number;
  invoiceHash: string;
  previousInvoiceHash: string;
  invoiceTypeCode: "STANDARD" | "SIMPLIFIED";
  clearanceStatus: string;
  digitalSignature: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  paymentStatus: string;
  items: SaleItemDetail[];
  customer: {
    nameEn: string;
    nameAr: string | null;
    phone: string;
    vatNumber: string | null;
  };
  businessLocation: {
    businessNameEn: string;
    businessNameAr: string;
    branchName: string;
    vatNumber: string | null;
    crNumber: string | null;
    nationalAddress: string | null;
    city: string | null;
    currency: string;
    invoiceLayoutSettings: InvoiceLayoutSettings | null;
  };
  registerSession: { openedAt: string; openedByUser: { fullNameEn: string } } | null;
  payments: { id: string; amount: string; paymentMethod: { nameEn: string; nameAr: string } }[];
}

export interface QrResponse {
  qrCodeBase64: string | null;
  qrImageDataUrl: string;
}

export interface InvoiceTemplateProps {
  sale: SaleDetail;
  layout: InvoiceLayoutSettings | null;
  qr: QrResponse | undefined;
  isAr: boolean;
  locale: string;
  currency: string;
}
