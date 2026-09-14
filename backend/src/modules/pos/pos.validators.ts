import { z } from "zod";
import { TAX_EXEMPTION_REASON_CODES } from "../zatca/taxExemptionReasons";

// Declares which POS screen a request came from (Service POS vs Product POS). Optional
// everywhere it appears - omitting it preserves the original single-POS behavior exactly
// (mixed carts allowed, no catalog filtering), which is what the legacy /pos screen still relies
// on. See pos.service.ts's assertItemsMatchMode and pos.routes.ts's requireModePermission for the
// two places this actually gets enforced.
const modeSchema = z.enum(["SERVICE", "PRODUCT"]).optional();

export const posSearchQuerySchema = z.object({
  query: z.string().optional(),
  businessLocationId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  mode: modeSchema,
});

const cartItemSchema = z
  .object({
    productId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    quantity: z.number().positive("Quantity must be greater than zero"),
    discountAmount: z.number().min(0).optional(),
    // Reference's per-line edit modal (`row_edit_product_price_modal.blade.php`) - unitPrice/taxId
    // overrides are only actually honored server-side for a caller holding "pos.editLinePrice"
    // (see pos.service.ts's priceLine()); a caller without it gets the normal catalog price/tax
    // regardless of what's sent here, so there's no need to also validate the permission here.
    unitPriceOverride: z.number().min(0).optional(),
    taxId: z.string().uuid().optional(),
    note: z.string().max(500).optional(),
    // Laundry's own dimension-based pricing (carpets/curtains priced per m²) - when both are set,
    // priceLine() multiplies the sent quantity by widthM*heightM.
    widthM: z.number().positive().optional(),
    heightM: z.number().positive().optional(),
  })
  .refine((item) => Boolean(item.productId) !== Boolean(item.serviceId), {
    message: "Each cart item must reference exactly one of productId or serviceId",
  });

const paymentInputSchema = z.object({
  paymentMethodId: z.string().uuid(),
  amount: z.number().positive("Payment amount must be greater than zero"),
  referenceNumber: z.string().optional(),
  // Reference's per-payment-row note (`payment[$row_index][note]`, sale_pos/partials/
  // payment_row_form.blade.php) - free text, not shown anywhere but the invoice's payment history.
  notes: z.string().max(500).optional(),
});

// Reference's own `additional_expense_key_N`/`_value_N` shape (4 fixed slots, not a dynamic
// list - see pos.service.ts's checkout()). A slot with no key is dropped rather than persisted
// as a nameless amount.
const additionalExpenseSchema = z.object({
  key: z.string().min(1).max(191),
  value: z.number().min(0),
});

export const checkoutSchema = z.object({
  businessLocationId: z.string().uuid(),
  customerId: z.string().uuid(),
  items: z.array(cartItemSchema).min(1, "Cart must contain at least one item"),
  payments: z.array(paymentInputSchema).default([]),
  notes: z.string().optional(),
  couponCode: z.string().optional(),
  invoiceDiscountMode: z.enum(["PERCENT", "FIXED"]).optional(),
  invoiceDiscountValue: z.number().min(0).optional(),
  shipping: z.number().min(0).optional(),
  redeemPoints: z.number().int().min(0).optional(),
  appliedCreditAmount: z.number().min(0).optional(),
  asDraft: z.boolean().optional(),
  // Only meaningful when asDraft (or a DELIVERY-typed customer group) results in a DRAFT sale -
  // true (default, see pos.service.ts) is the reference's own "quotation" sub-type, false is a
  // "Delivery" (the laundry intake/drop-off ticket the reference's own "Add Delivery" screen
  // creates) - both are the exact same DRAFT status, just numbered/labeled differently.
  isQuotation: z.boolean().optional(),
  mode: modeSchema,
  // Reference's own sell-level custom_field_1..4 - free text, org-labeled (see
  // Organization.sellCustomFieldNLabel), by index (customFields[0] -> customField1, ...).
  customFields: z.array(z.string().max(500)).max(4).optional(),
  additionalExpenses: z.array(additionalExpenseSchema).max(4).optional(),
  taxExemptionReasonCode: z.enum(TAX_EXEMPTION_REASON_CODES).optional(),
  // Reference's Add Sale header (`sell/create.blade.php`) - see pos.service.ts's checkout().
  priceListId: z.string().uuid().optional(),
  payTermNumber: z.number().int().min(0).optional(),
  payTermType: z.enum(["DAYS", "MONTHS"]).optional(),
  // Which frontend rang this up - reference's own `is_direct_sale` distinction (see schema.prisma's
  // SaleChannel comment). Defaults to POS server-side when omitted, matching every checkout caller
  // that predates "Add Sale" and never sends this.
  channel: z.enum(["POS", "ADD_SALE"]).optional(),
  // Returned by POST /sales/documents (see sale.controller.ts's uploadDocument) - the shape this
  // regex checks is exactly what that endpoint always produces, never a client-constructed path.
  documentPath: z
    .string()
    .regex(/^sale-documents\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.[a-z0-9]+$/, "Invalid document path")
    .optional(),
  documentOriginalName: z.string().max(255).optional(),
});

export const confirmQuoteSchema = z.object({
  payments: z.array(paymentInputSchema).default([]),
  appliedCreditAmount: z.number().min(0).optional(),
});

// Reference's action-dropdown "Send Notification" (quotation-only) - at least one channel, each
// with its own recipient override (reference's own modal defaults these from the contact but lets
// the sender edit them before sending).
export const sendQuoteNotificationSchema = z
  .object({
    email: z.string().email().optional(),
    mobile: z.string().optional(),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.mobile), { message: "Choose at least one channel to send to" });

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ConfirmQuoteInput = z.infer<typeof confirmQuoteSchema>;
export type SendQuoteNotificationInput = z.infer<typeof sendQuoteNotificationSchema>;

export const listQuotesQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
  customerGroupId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const heldItemSchema = z
  .object({
    productId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    descriptionEn: z.string().min(1),
    descriptionAr: z.string().optional(),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
    taxPercent: z.number().min(0).default(0),
    taxType: z.enum(["INCLUSIVE", "EXCLUSIVE"]).default("EXCLUSIVE"),
    discountAmount: z.number().min(0).default(0),
  })
  .refine((item) => Boolean(item.productId) !== Boolean(item.serviceId), {
    message: "Each held item must reference exactly one of productId or serviceId",
  });

export const holdSaleSchema = z.object({
  businessLocationId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  label: z.string().min(1),
  note: z.string().optional(),
  items: z.array(heldItemSchema).min(1, "Cannot hold an empty cart"),
  mode: modeSchema,
});

export type HoldSaleInput = z.infer<typeof holdSaleSchema>;

export const listHeldSalesQuerySchema = z.object({
  businessLocationId: z.string().uuid(),
  mode: modeSchema,
});
