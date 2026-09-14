import { Router } from "express";
import * as controller from "./export.controller";
import { validate } from "../../middleware/validate";
import { exportXlsxSchema } from "./export.validators";

const router = Router();

// Formats data the requester already has (their own already-loaded, already-authorized table
// rows) into a file - no DB lookups here, so no per-module permission needed beyond the global
// authenticate + requireActiveSubscription paywall this router is mounted behind.
router.post("/xlsx", validate(exportXlsxSchema), controller.exportXlsx);

export default router;
