import { Router } from "express";
import * as service from "./pos.service";
import { sendSuccess } from "../../utils/apiResponse";

// Reference's own public, unauthenticated `/quote/{token}` (SellPosController@showInvoice) -
// mounted OUTSIDE the auth/paywall gate in routes/index.ts, unlike every other pos.* route.
// Deliberately its own tiny router file (not folded into pos.routes.ts) so it's obvious at a
// glance which single endpoint in this whole module needs no login - see routes/index.ts's
// "Ungated" section comment for why that separation matters.
const router = Router();

router.get("/:token", async (req, res) => {
  const sale = await service.getSaleByPublicToken(req.params.token);
  return sendSuccess(res, sale, "OK");
});

export default router;
