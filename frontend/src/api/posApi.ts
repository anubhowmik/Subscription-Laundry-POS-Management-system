import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { ApiSuccess, PaginationMeta } from "../types/api";

/**
 * React Query hooks for the POS screen. Every fetch/mutation the POS needs lives here so the
 * page components stay declarative. Product/customer reads are cached; checkout invalidates them.
 */

export interface PosCategory {
  id: string;
  nameEn: string;
  nameAr: string;
}
export interface PosBrand {
  id: string;
  nameEn: string;
  nameAr: string;
}

export interface PosProduct {
  id: string;
  nameEn: string;
  nameAr: string;
  sku: string;
  barcode: string | null;
  sellingPrice: string;
  sellingPriceTaxType: "INCLUSIVE" | "EXCLUSIVE";
  image: string | null;
  manageStock: boolean;
  totalStock: number;
  category?: { id: string; nameEn: string } | null;
  brand?: { id: string; nameEn: string } | null;
  unit?: { shortName: string } | null;
  tax?: { percentage: string } | null;
  stocks?: { businessLocationId: string; quantity: string }[];
}

export interface PosCustomerRow {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string | null;
  phone: string;
  balance: string;
  rewardPoints?: number;
  cashBack?: string;
  // Reference's Add Sale header shows Billing/Shipping Address and pre-fills Pay Term from
  // whichever customer is picked - these ride along on the same list response rather than a
  // separate lookup, since GET /customers already returns the full row.
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  shippingAddress?: string | null;
  paymentTermsDays?: number;
  payTermType?: "DAYS" | "MONTHS" | null;
}

export interface PosPaymentMethod {
  id: string;
  nameEn: string;
  nameAr: string;
  code: string;
}

// Shared between InvoicePanel.tsx's PaymentModal and QuotesPage.tsx's ConfirmQuoteModal - both
// route these through BnplFlowModal's multi-step session flow instead of a plain tender tile.
export const BNPL_CODES = ["BNPL_TAMARA", "BNPL_TABBY", "BNPL_MISPAY"];

interface ProductFilters {
  businessLocationId?: string;
  categoryId?: string;
  brandId?: string;
  search?: string;
  customerId?: string;
  /** Set false to skip fetching (e.g. a fixed-mode POS page that never shows products). Defaults to true. */
  enabled?: boolean;
}

export function useCategories() {
  return useQuery({
    queryKey: ["pos", "categories"],
    queryFn: async () => (await api.get<ApiSuccess<PosCategory[]>>("/categories")).data.data,
  });
}

export function useBrands() {
  return useQuery({
    queryKey: ["pos", "brands"],
    queryFn: async () => (await api.get<ApiSuccess<PosBrand[]>>("/brands")).data.data,
  });
}

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: ["pos", "products", filters],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PosProduct[]>>("/products", {
        params: {
          limit: 200,
          status: "ACTIVE",
          businessLocationId: filters.businessLocationId,
          categoryId: filters.categoryId || undefined,
          brandId: filters.brandId || undefined,
          search: filters.search || undefined,
          customerId: filters.customerId || undefined,
        },
      });
      return res.data.data;
    },
    enabled: Boolean(filters.businessLocationId) && (filters.enabled ?? true),
  });
}

export interface PosService {
  id: string;
  nameEn: string;
  nameAr: string;
  code: string;
  price: string;
  estimatedProcessingHours: number;
  category?: { id: string; nameEn: string } | null;
  unit?: { shortName: string } | null;
  tax?: { percentage: string } | null;
}

export function useServiceCategories() {
  return useQuery({
    queryKey: ["pos", "service-categories"],
    queryFn: async () => (await api.get<ApiSuccess<PosCategory[]>>("/service-categories")).data.data,
  });
}

export function useServices(filters: { businessLocationId?: string; categoryId?: string; search?: string; customerId?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: ["pos", "services", filters],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PosService[]>>("/services", {
        params: {
          limit: 200,
          status: "ACTIVE",
          businessLocationId: filters.businessLocationId,
          categoryId: filters.categoryId || undefined,
          search: filters.search || undefined,
          customerId: filters.customerId || undefined,
        },
      });
      return res.data.data;
    },
    enabled: Boolean(filters.businessLocationId) && (filters.enabled ?? true),
  });
}

export function useCustomers(search: string) {
  return useQuery({
    queryKey: ["pos", "customers", search],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PosCustomerRow[]>>("/customers", {
        params: { search: search || undefined, limit: 20, status: "ACTIVE" },
      });
      return res.data.data;
    },
  });
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: ["pos", "payment-methods"],
    queryFn: async () => (await api.get<ApiSuccess<PosPaymentMethod[]>>("/payment-methods")).data.data,
  });
}

export interface PosTax {
  id: string;
  nameEn: string;
  nameAr: string;
  percentage: string;
  categoryCode: string;
}

// Backs the per-line tax-override dropdown (reference's row_edit_product_price_modal.blade.php).
// Only fetched by callers who actually hold pos.editLinePrice - the endpoint itself is gated the
// same way, so this quietly 403s for anyone without it (the edit modal never mounts it for them).
export function useTaxes(enabled: boolean) {
  return useQuery({
    queryKey: ["pos", "taxes"],
    queryFn: async () => (await api.get<ApiSuccess<PosTax[]>>("/pos/taxes")).data.data,
    enabled,
  });
}

export interface CheckoutItemInput {
  productId?: string;
  serviceId?: string;
  quantity: number;
  discountAmount: number;
  // Reference's per-line edit modal - only actually honored server-side for a caller holding
  // pos.editLinePrice (see pos.service.ts's priceLine()); harmless to always send since a caller
  // without the permission has these ignored and gets the normal catalog price/tax regardless.
  unitPriceOverride?: number;
  taxId?: string;
  note?: string;
  // Laundry's own dimension-based pricing (carpets/curtains priced per m²).
  widthM?: number;
  heightM?: number;
}
export interface CheckoutPaymentInput {
  paymentMethodId: string;
  amount: number;
  referenceNumber?: string; // carries a captured BnplSession's id through to the Payment row
  notes?: string;
}
export interface CheckoutAdditionalExpenseInput {
  key: string;
  value: number;
}
export interface CheckoutInput {
  businessLocationId: string;
  customerId: string;
  items: CheckoutItemInput[];
  payments: CheckoutPaymentInput[];
  notes?: string;
  couponCode?: string;
  couponOtp?: string;
  // The promotion applied in the cart (reference POS Apply) - omitted lets checkout try the auto-apply ones.
  promotionId?: string;
  invoiceDiscountMode?: "PERCENT" | "FIXED";
  invoiceDiscountValue?: number;
  shipping?: number;
  redeemPoints?: number;
  appliedCreditAmount?: number;
  asDraft?: boolean;
  mode?: "SERVICE" | "PRODUCT";
  customFields?: string[];
  additionalExpenses?: CheckoutAdditionalExpenseInput[];
  taxExemptionReasonCode?: string;
  priceListId?: string;
  payTermNumber?: number;
  payTermType?: "DAYS" | "MONTHS";
  documentPath?: string;
  documentOriginalName?: string;
  channel?: "POS" | "ADD_SALE";
}
export interface SaleResult {
  id: string;
  invoiceNumber: string | null;
  quoteNumber?: string | null;
  deliveryNumber?: string | null;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  estimatedReadyAt: string | null;
}

export interface UploadedSaleDocument {
  documentPath: string;
  documentOriginalName: string;
}

// Reference's "Attach Document" on Add Sale - uploaded separately BEFORE checkout (checkout is
// plain JSON, not multipart), then referenced in the checkout payload by the path this returns.
export function useUploadSaleDocument() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("document", file);
      return (await api.post<ApiSuccess<UploadedSaleDocument>>("/sales/documents", formData)).data.data;
    },
  });
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CheckoutInput) =>
      (await api.post<ApiSuccess<SaleResult>>("/pos/checkout", input)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos", "products"] });
      qc.invalidateQueries({ queryKey: ["pos", "customers"] });
    },
  });
}

// --- Quotes ----------------------------------------------------------------------------------
// A quote is a DRAFT sale: same priced cart, no stock/ZATCA/payment/loyalty until confirmed.

export function useCreateQuote() {
  return useMutation({
    mutationFn: async (input: CheckoutInput) =>
      (await api.post<ApiSuccess<SaleResult>>("/pos/quotes", { ...input, asDraft: true })).data.data,
  });
}

// Reference's action-dropdown "Edit" - reopens the create-sale pipeline against the same row (see
// backend pos.service.ts checkout()'s existingDraftId param). Works for both Quotes and
// Deliveries, same as confirm/void - one PUT route serves both DRAFT sub-types.
export function useUpdateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CheckoutInput }) =>
      (await api.put<ApiSuccess<SaleResult>>(`/pos/quotes/${id}`, { ...input, asDraft: true })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos", "quotes"] });
      qc.invalidateQueries({ queryKey: ["pos", "deliveries"] });
    },
  });
}

export interface QuoteRow {
  id: string;
  quoteNumber: string | null;
  // Reference's own "Delivery" (laundry intake/drop-off ticket) - the exact same DRAFT sale as a
  // Quote, just numbered/labeled differently. See Sale.isQuotation's schema comment.
  deliveryNumber: string | null;
  isQuotation: boolean;
  totalAmount: string;
  createdAt: string;
  businessLocationId: string;
  // Which screen originally created this draft - reference's own `is_direct_sale` distinction,
  // which its "Edit" action branches on (SellController@edit vs SellPosController@edit) to reopen
  // the matching form. QuotesPage.tsx's Edit row action does the same for /sales/create vs /pos.
  channel: "POS" | "ADD_SALE";
  customer: {
    id: string;
    nameEn: string;
    nameAr: string | null;
    phone: string;
    email: string | null;
    balance: string;
    cashBack: string;
    customerGroup: { id: string; nameEn: string; nameAr: string | null } | null;
  };
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string };
  items: { descriptionEn: string; descriptionAr: string | null; quantity: string }[];
}

export interface QuotesListParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  businessLocationId?: string;
  customerId?: string;
  createdBy?: string;
  customerGroupId?: string;
  from?: string;
  to?: string;
}

export function useQuotes(params: QuotesListParams = {}, enabled: boolean = true) {
  return useQuery({
    queryKey: ["pos", "quotes", params],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<QuoteRow[]>>("/pos/quotes", {
        params: { page: params.page ?? 1, limit: params.limit ?? 25, ...params },
      });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
    enabled,
  });
}

// Reference's "Add Delivery"/"List Deliveries" - a sibling of Quotes hitting /pos/deliveries
// instead of /pos/quotes (separate query key so the two lists cache independently), but sharing
// the exact same confirm/void mutations below since neither cares which DRAFT sub-type it acts on.
export function useCreateDelivery() {
  return useMutation({
    mutationFn: async (input: CheckoutInput) =>
      (await api.post<ApiSuccess<SaleResult>>("/pos/deliveries", { ...input, asDraft: true })).data.data,
  });
}

export function useDeliveries(params: QuotesListParams = {}, enabled: boolean = true) {
  return useQuery({
    queryKey: ["pos", "deliveries", params],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<QuoteRow[]>>("/pos/deliveries", {
        params: { page: params.page ?? 1, limit: params.limit ?? 25, ...params },
      });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
    enabled,
  });
}

export function useConfirmQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payments, appliedCreditAmount }: { id: string; payments: CheckoutPaymentInput[]; appliedCreditAmount?: number }) =>
      (await api.post<ApiSuccess<SaleResult>>(`/pos/quotes/${id}/confirm`, { payments, appliedCreditAmount })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos", "quotes"] });
      qc.invalidateQueries({ queryKey: ["pos", "deliveries"] });
      qc.invalidateQueries({ queryKey: ["pos", "products"] });
      qc.invalidateQueries({ queryKey: ["pos", "customers"] });
    },
  });
}

export function useVoidQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/pos/quotes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos", "quotes"] });
      qc.invalidateQueries({ queryKey: ["pos", "deliveries"] });
    },
  });
}

// Reference's action-dropdown "Delete" - a genuine hard delete, distinct from useVoidQuote()
// above (this app's own soft-cancel addition).
export function useDeleteQuotePermanently() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/pos/quotes/${id}/permanent`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos", "quotes"] });
      qc.invalidateQueries({ queryKey: ["pos", "deliveries"] });
    },
  });
}

// Reference's action-dropdown "View Quote URL" (quotation-only) - mints (once) or returns the
// existing public share token for this quote. A mutation rather than a query since it's a
// deliberate on-demand action (the row action's onClick), not something to fetch just by having
// the row on screen.
export function useShareUrl() {
  return useMutation({
    mutationFn: async (id: string) => (await api.get<ApiSuccess<{ token: string }>>(`/pos/quotes/${id}/share-url`)).data.data,
  });
}

// Reference's action-dropdown "Send Notification" (quotation-only) - fires the NEW_QUOTATION
// template over whichever channel(s) the sender picks in SendNotificationModal.
export function useSendQuoteNotification() {
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: { email?: string; mobile?: string } }) =>
      api.post(`/pos/quotes/${id}/notify`, input),
  });
}

export interface CreateCustomerInput {
  nameEn: string;
  nameAr?: string;
  phone: string;
  businessLocationId?: string;
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCustomerInput) =>
      (await api.post<ApiSuccess<PosCustomerRow>>("/customers", input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos", "customers"] }),
  });
}

// --- Held ("suspended") sales --------------------------------------------------------------
// Persisted server-side so a held cart survives a refresh, a different terminal, or the
// cashier logging out and back in - not just in-memory like a plain client-side hold.

export interface HeldSaleItemInput {
  productId?: string;
  serviceId?: string;
  descriptionEn: string;
  descriptionAr?: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  taxType: "INCLUSIVE" | "EXCLUSIVE";
  discountAmount: number;
}
export interface HoldSaleInput {
  businessLocationId: string;
  customerId?: string;
  label: string;
  note?: string;
  items: HeldSaleItemInput[];
  mode?: "SERVICE" | "PRODUCT";
}
export interface HeldSaleItemRow extends HeldSaleItemInput {
  id: string;
}
export interface HeldSaleRow {
  id: string;
  label: string;
  note: string | null;
  createdAt: string;
  customerId: string | null;
  customer: { nameEn: string; nameAr: string | null } | null;
  items: HeldSaleItemRow[];
}

export function useHeldSales(businessLocationId: string | undefined, mode?: "SERVICE" | "PRODUCT") {
  return useQuery({
    queryKey: ["pos", "held-sales", businessLocationId, mode],
    queryFn: async () => (await api.get<ApiSuccess<HeldSaleRow[]>>("/pos/hold-sales", { params: { businessLocationId, mode } })).data.data,
    enabled: Boolean(businessLocationId),
  });
}

export function useHoldSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: HoldSaleInput) => (await api.post<ApiSuccess<HeldSaleRow>>("/pos/hold-sale", input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos", "held-sales"] }),
  });
}

export function useDiscardHeldSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/pos/hold-sales/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos", "held-sales"] }),
  });
}

/** Fetches full held-sale detail (for resuming into the cart) and removes it server-side. */
export function useResumeHeldSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const held = (await api.get<ApiSuccess<HeldSaleRow>>(`/pos/hold-sales/${id}`)).data.data;
      await api.delete(`/pos/hold-sales/${id}`);
      return held;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos", "held-sales"] }),
  });
}

// --- Register (cash drawer) sessions --------------------------------------------------------
// Opening a register is optional - checkout still works if none is open. When one IS open, the
// backend automatically attributes sales rung up at that location to it for reconciliation.

export interface RegisterSessionRow {
  id: string;
  businessLocationId: string;
  openedAt: string;
  openingCashAmount: string;
  closedAt: string | null;
  expectedCashAmount: string | null;
  countedCashAmount: string | null;
  cashDifference: string | null;
  denominations: Record<string, number> | null;
  notes: string | null;
  status: "OPEN" | "CLOSED";
  openedByUser?: { fullNameEn: string };
  closedByUser?: { fullNameEn: string } | null;
}

export interface RegisterLedgerRow {
  id: string;
  type: "CREDIT" | "DEBIT";
  amount: string;
  paymentMethod: string;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
}

export function useCurrentRegisterSession(businessLocationId: string | undefined) {
  return useQuery({
    queryKey: ["pos", "register-session", "current", businessLocationId],
    queryFn: async () =>
      (await api.get<ApiSuccess<RegisterSessionRow | null>>("/register-sessions/current", { params: { businessLocationId } })).data.data,
    enabled: Boolean(businessLocationId),
  });
}

export function useOpenRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { businessLocationId: string; openingCashAmount: number }) =>
      (await api.post<ApiSuccess<RegisterSessionRow>>("/register-sessions/open", input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos", "register-session"] }),
  });
}

export function useCloseRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      countedCashAmount: number;
      notes?: string;
      denominations?: Record<string, number>;
    }) => (await api.post<ApiSuccess<RegisterSessionRow>>(`/register-sessions/${id}/close`, input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos", "register-session"] }),
  });
}

// --- Price lists -----------------------------------------------------------------------------
// Negotiated pricing assigned to a customer or customer group. A customer's own price list wins
// over their group's. The POS grid and checkout resolve overrides through the same code path
// server-side (see pos.service.ts), so the price shown always matches what's charged.

export interface PriceListRow {
  id: string;
  nameEn: string;
  nameAr: string;
  isActive: boolean;
}
export interface PriceListItemRow {
  id: string;
  productId: string | null;
  serviceId: string | null;
  price: string;
  product?: { nameEn: string } | null;
  service?: { nameEn: string } | null;
}
export interface PriceListDetail extends PriceListRow {
  items: PriceListItemRow[];
}

export function usePriceLists() {
  return useQuery({
    queryKey: ["price-lists"],
    queryFn: async () => (await api.get<ApiSuccess<PriceListRow[]>>("/price-lists")).data.data,
  });
}

export function usePriceListDetail(id: string | null) {
  return useQuery({
    queryKey: ["price-lists", id],
    queryFn: async () => (await api.get<ApiSuccess<PriceListDetail>>(`/price-lists/${id}`)).data.data,
    enabled: Boolean(id),
  });
}

export function useCreatePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nameEn: string; nameAr: string }) =>
      (await api.post<ApiSuccess<PriceListRow>>("/price-lists", input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-lists"] }),
  });
}

export function useDeactivatePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/price-lists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-lists"] }),
  });
}

export function useSetPriceListItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, items }: { id: string; items: { productId?: string; serviceId?: string; price: number }[] }) =>
      (await api.put<ApiSuccess<PriceListItemRow[]>>(`/price-lists/${id}/items`, { items })).data.data,
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["price-lists", vars.id] }),
  });
}
