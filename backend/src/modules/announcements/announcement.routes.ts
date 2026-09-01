import { Router } from "express";
import * as controller from "./announcement.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createAnnouncementSchema, listAnnouncementQuerySchema, updateAnnouncementSchema } from "./announcement.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry"));

// Any authenticated user can see which announcements are currently live for their location -
// this is what the dashboard banner calls. Managing announcements is gated below.
router.get("/active", controller.listActive);

router.use(requirePermission("announcements.manage"));
router.get("/", validate(listAnnouncementQuerySchema, "query"), controller.list);
router.get("/:id", controller.getById);
router.post("/", validate(createAnnouncementSchema), controller.create);
router.put("/:id", validate(updateAnnouncementSchema), controller.update);
router.delete("/:id", controller.remove);

export default router;
