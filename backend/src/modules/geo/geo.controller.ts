import { Request, Response } from "express";
import * as service from "./geo.service";
import { sendSuccess } from "../../utils/apiResponse";

export async function listCountries(_req: Request, res: Response) {
  return sendSuccess(res, await service.listCountries());
}

export async function listStates(req: Request, res: Response) {
  return sendSuccess(res, await service.listStates(String(req.query.countryId)));
}

export async function listCities(req: Request, res: Response) {
  return sendSuccess(res, await service.listCities(String(req.query.stateId)));
}
