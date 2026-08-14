import { Router } from "express";
import * as controller from "./certificate.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { complianceCsidSchema } from "./certificate.validators";

const router = Router();
router.use(authenticate, requirePermission("business_locations.update"));

router.post("/:locationId/generate", controller.generate);
router.get("/:locationId/status", controller.getStatus);
router.post("/:locationId/compliance-csid", validate(complianceCsidSchema), controller.complianceCsid);
router.post("/:locationId/production-csid", controller.productionCsid);

export default router;
