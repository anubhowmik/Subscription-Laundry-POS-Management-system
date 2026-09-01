import { Router } from "express";
import * as controller from "./booking.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createBookingSchema, updateBookingStatusSchema, listBookingsQuerySchema } from "./booking.validators";

const router = Router();
router.use(authenticate, requirePermission("bookings.manage"));
router.use(requirePermission("app.pos_laundry"));

router.get("/", validate(listBookingsQuerySchema, "query"), controller.list);
router.post("/", validate(createBookingSchema), controller.create);
router.put("/:id/status", validate(updateBookingStatusSchema), controller.updateStatus);

export default router;
