import { Router } from "express";
import * as controller from "./geo.controller";
import { validate } from "../../middleware/validate";
import { listStatesQuerySchema, listCitiesQuerySchema } from "./geo.validators";

const router = Router();

// Global, read-only reference data (Country/State/City) - no organization scoping, no special
// permission beyond the paywall this router is mounted behind. Powers the Suppliers/Customers
// address cascading dropdowns, matching the reference's own Country/State/City picker.
router.get("/countries", controller.listCountries);
router.get("/states", validate(listStatesQuerySchema, "query"), controller.listStates);
router.get("/cities", validate(listCitiesQuerySchema, "query"), controller.listCities);

export default router;
