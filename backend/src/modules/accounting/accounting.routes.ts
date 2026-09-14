import { Router } from "express";
import * as accountController from "./account.controller";
import * as journalController from "./journalEntry.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createAccountSchema, updateAccountSchema } from "./account.validators";
import { createJournalEntrySchema, updateJournalEntrySchema } from "./journalEntry.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("accounting.view"));

router.get("/reports/trial-balance", accountController.trialBalance);
router.get("/reports/balance-sheet", accountController.balanceSheet);
router.get("/reports/general-ledger", accountController.generalLedger);

router.get("/accounts", accountController.list);
router.get("/accounts/:id", accountController.getById);
router.post("/accounts", requirePermission("accounting.manage"), validate(createAccountSchema), accountController.create);
router.put("/accounts/:id", requirePermission("accounting.manage"), validate(updateAccountSchema), accountController.update);
router.delete("/accounts/:id", requirePermission("accounting.manage"), accountController.deactivate);

router.get("/journal-entries", journalController.list);
router.get("/journal-entries/:id", journalController.getById);
router.post("/journal-entries", requirePermission("accounting.manage"), validate(createJournalEntrySchema), journalController.create);
router.put("/journal-entries/:id", requirePermission("accounting.manage"), validate(updateJournalEntrySchema), journalController.update);
router.delete("/journal-entries/:id", requirePermission("accounting.manage"), journalController.remove);
router.put("/journal-entries/:id/post", requirePermission("accounting.manage"), journalController.post);
router.post("/journal-entries/:id/reverse", requirePermission("accounting.manage"), journalController.reverse);

export default router;
