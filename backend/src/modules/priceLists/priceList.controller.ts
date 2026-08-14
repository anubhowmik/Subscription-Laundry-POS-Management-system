import { Request, Response } from "express";
import * as service from "./priceList.service";
import { sendSuccess } from "../../utils/apiResponse";
import { getParam } from "../../utils/params";

export async function list(req: Request, res: Response) {
  return sendSuccess(res, await service.list(req.user!.organizationId));
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const priceList = await service.create(req.body, req.user!.organizationId);
  return sendSuccess(res, priceList, "Price list created", 201);
}

export async function update(req: Request, res: Response) {
  const priceList = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  return sendSuccess(res, priceList, "Price list updated");
}

export async function deactivate(req: Request, res: Response) {
  const priceList = await service.deactivate(getParam(req, "id"), req.user!.organizationId);
  return sendSuccess(res, priceList, "Price list deactivated");
}

export async function setItems(req: Request, res: Response) {
  const items = await service.setItems(getParam(req, "id"), req.body.items, req.user!.organizationId);
  return sendSuccess(res, items, "Price list items updated");
}
