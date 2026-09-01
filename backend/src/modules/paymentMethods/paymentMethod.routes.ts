import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { sendSuccess } from "../../utils/apiResponse";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry"));

router.get("/", async (req, res) => {
  const methods = await prisma.paymentMethod.findMany({
    where: { organizationId: req.user!.organizationId, isActive: true },
    orderBy: { code: "asc" },
  });
  return sendSuccess(res, methods);
});

export default router;
