import { Router } from "express";
import * as controller from "./paymentAccount.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import {
  accountSchema,
  accountTypeSchema,
  depositSchema,
  fundTransferSchema,
  linkAccountSchema,
  locationDefaultsSchema,
  updateTransactionSchema,
} from "./paymentAccount.validators";

const router = Router();
router.use(authenticate);

const access = requirePermission("payment_accounts.access");

// The account dropdown also feeds the Expense/Purchase "Payment Account" field and a branch's
// Payment Options, so those screens' own permissions can read it too.
router.get(
  "/dropdown",
  requirePermission("payment_accounts.access", "sell_payment_report.view", "expenses.create", "expenses.update", "purchases.manage", "business_locations.update"),
  controller.dropdown,
);
router.get("/location-defaults/:locationId", requirePermission("payment_accounts.access", "business_locations.update"), controller.getLocationDefaults);
router.put("/location-defaults/:locationId", requirePermission("business_locations.update"), validate(locationDefaultsSchema), controller.setLocationDefaults);

router.get("/sell-payments", requirePermission("sell_payment_report.view", "payment_accounts.access"), controller.sellPayments);
router.get("/filter-options", requirePermission("sell_payment_report.view", "payment_accounts.access"), controller.filterOptions);
router.get("/customer-search", requirePermission("sell_payment_report.view", "payment_accounts.access"), controller.customerSearch);

router.get("/types", access, controller.listTypes);
router.post("/types", access, validate(accountTypeSchema), controller.createType);
router.put("/types/:id", access, validate(accountTypeSchema), controller.updateType);
router.delete("/types/:id", access, controller.deleteType);

router.get("/reports/cash-flow", access, controller.cashFlow);
router.get("/reports/balance-sheet", access, controller.balanceSheet);
router.get("/reports/trial-balance", access, controller.trialBalance);
router.get("/reports/payment-account-report", access, controller.paymentAccountReport);
router.put("/payments/:paymentId/link", access, validate(linkAccountSchema), controller.linkAccount);

router.post("/deposit", access, validate(depositSchema), controller.deposit);
router.post("/fund-transfer", access, validate(fundTransferSchema), controller.fundTransfer);
router.get("/transactions/:id", requirePermission("payment_accounts.edit_transaction"), controller.getTransaction);
router.put("/transactions/:id", requirePermission("payment_accounts.edit_transaction"), validate(updateTransactionSchema), controller.updateTransaction);
router.delete("/transactions/:id", requirePermission("payment_accounts.delete_transaction"), controller.deleteTransaction);

router.get("/", access, controller.list);
router.post("/", access, validate(accountSchema), controller.create);
router.get("/:id", access, controller.getById);
router.put("/:id", access, validate(accountSchema), controller.update);
router.put("/:id/close", access, controller.close);
router.put("/:id/activate", access, controller.activate);
router.get("/:id/book", access, controller.accountBook);

export default router;
