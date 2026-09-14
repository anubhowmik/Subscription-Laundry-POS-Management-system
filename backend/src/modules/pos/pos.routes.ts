import { Router } from "express";
import * as controller from "./pos.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission, requireModePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import {
  checkoutSchema,
  confirmQuoteSchema,
  holdSaleSchema,
  listHeldSalesQuerySchema,
  listQuotesQuerySchema,
  posSearchQuerySchema,
  sendQuoteNotificationSchema,
} from "./pos.validators";

const router = Router();
// Any of the three POS-access tiers gets you into this router at all - the finer distinction
// (which mode you're actually allowed to use) is enforced per-request by requireModePermission()
// below, keyed off the mode field each checkout/hold-sale/quote body carries.
router.use(authenticate, requirePermission("pos.access", "pos.access.service", "pos.access.product"));
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

router.get("/search", validate(posSearchQuerySchema, "query"), controller.search);
router.get("/taxes", requirePermission("pos.editLinePrice"), controller.listActiveTaxes);
router.post("/checkout", requirePermission("sales.create"), validate(checkoutSchema), requireModePermission(), controller.checkout);

router.post("/hold-sale", validate(holdSaleSchema), requireModePermission(), controller.holdSale);
router.get("/hold-sales", validate(listHeldSalesQuerySchema, "query"), controller.listHeldSales);
router.get("/hold-sales/:id", controller.getHeldSale);
router.delete("/hold-sales/:id", controller.discardHeldSale);

router.get("/quotes", requirePermission("sales.quote"), validate(listQuotesQuerySchema, "query"), controller.listQuotes);
router.post("/quotes", requirePermission("sales.quote"), validate(checkoutSchema), requireModePermission(), controller.createQuote);
// Reference's action-dropdown "Edit" - reopens the same create-sale form pre-filled and
// resubmits onto the same row. Gated by "sales.update" (already this app's general "modify an
// existing sale" permission, used for submit-to-zatca/pay-due) rather than "sales.quote", matching
// the reference's own dedicated draft.update/quotation.update permission being distinct from
// create/confirm.
router.put("/quotes/:id", requirePermission("sales.update"), validate(checkoutSchema), requireModePermission(), controller.updateQuote);
router.post("/quotes/:id/confirm", requirePermission("sales.quote"), validate(confirmQuoteSchema), controller.confirmQuote);
router.delete("/quotes/:id", requirePermission("sales.quote"), controller.voidQuote);
// Reference's action-dropdown "Delete" (a genuine hard delete) - distinct from the void route
// above (this app's own soft-cancel addition, kept as-is). A separate path rather than overloading
// DELETE /quotes/:id since the two have very different semantics and both need to stay reachable.
router.delete("/quotes/:id/permanent", requirePermission("sales.delete"), controller.deleteQuote);
// Reference's action-dropdown "View Quote URL" - mints (or returns the already-minted) public
// token; see publicQuote.routes.ts for the actual ungated link this powers.
router.get("/quotes/:id/share-url", requirePermission("sales.quote"), controller.getShareUrl);
// Reference's action-dropdown "Send Notification" (quotation-only).
router.post("/quotes/:id/notify", requirePermission("sales.quote"), validate(sendQuoteNotificationSchema), controller.sendQuoteNotification);

// Reference's "Add Delivery"/"List Deliveries" - the same DRAFT-sale mechanism as a Quote (see
// pos.controller.ts's createDelivery/listDeliveries), gated by the same "sales.quote" permission
// tier deliberately - both are "hold this sale unfinished" capabilities at the same trust level,
// not worth a brand-new permission for.
router.get("/deliveries", requirePermission("sales.quote"), validate(listQuotesQuerySchema, "query"), controller.listDeliveries);
router.post("/deliveries", requirePermission("sales.quote"), validate(checkoutSchema), requireModePermission(), controller.createDelivery);

export default router;
