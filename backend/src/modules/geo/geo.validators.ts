import { z } from "zod";

export const listStatesQuerySchema = z.object({
  countryId: z.string().uuid(),
});

export const listCitiesQuerySchema = z.object({
  stateId: z.string().uuid(),
});
