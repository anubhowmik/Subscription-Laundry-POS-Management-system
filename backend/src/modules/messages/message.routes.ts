import { Router } from "express";
import * as controller from "./message.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createMessageSchema, listMessageQuerySchema } from "./message.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("messages.manage"));

router.get("/", validate(listMessageQuerySchema, "query"), controller.list);
router.get("/unread-count", controller.unreadCount);
router.get("/:id", controller.getById);
router.post("/", validate(createMessageSchema), controller.create);
router.delete("/:id", controller.remove);

export default router;
