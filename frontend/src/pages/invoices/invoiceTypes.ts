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
  // Null on a DRAFT quote/delivery until confirmed - see quoteNumber/deliveryNumber below, which
  // fill in for display when this is null. See InvoiceDocument.tsx's displayNumber/displayTitle.
  invoiceNumber: string | null;
  quoteNumber: string | null;
  deliveryNumber: string | null;
  isQuotation: boolean;
  status: "DRAFT" | "FINAL" | "CANCELLED";
  saleDate: string;
  estimatedReadyAt: string | null;
  icv: number | null;
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
  };
  resolvedInvoiceLayout: InvoiceLayoutSettings | null;
  registerSession: { openedAt: string; openedByUser: { fullNameEn: string } } | null;
  payments: { id: string; amount: string; paymentMethod: { nameEn: string; nameAr: string } }[];
  // Add Sale's "Attach Document" (see PosPage.tsx's AddSaleHeader) - documentPath itself is never
  // shown/used directly here, only whether it's set; the actual download goes through the
  // authenticated GET /sales/:id/document endpoint, not a direct file URL.
  documentPath: string | null;
  documentOriginalName: string | null;
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
