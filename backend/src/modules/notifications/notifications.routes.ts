import { Router } from "express";
import * as controller from "./notifications.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { updateNotificationSettingsSchema, updateNotificationTemplateSchema } from "./notifications.validators";

const router = Router();
router.use(authenticate, requirePermission("settings.manage"));
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

router.get("/settings", controller.getSettings);
router.put("/settings", validate(updateNotificationSettingsSchema), controller.updateSettings);
router.get("/logs", controller.listLogs);
router.get("/templates", controller.listTemplates);
router.put("/templates/:trigger", validate(updateNotificationTemplateSchema), controller.updateTemplate);

export default router;
