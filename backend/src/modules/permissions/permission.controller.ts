import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { sendSuccess } from "../../utils/apiResponse";

export async function list(_req: Request, res: Response) {
  const permissions = await prisma.permission.findMany({ orderBy: [{ module: "asc" }, { code: "asc" }] });
  return sendSuccess(res, permissions);
}
