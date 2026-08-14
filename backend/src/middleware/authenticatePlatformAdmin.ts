import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { AuthenticationError } from "../utils/AppError";
import { verifyPlatformAccessToken } from "../utils/jwt";

/**
 * Authenticates a platform operator. verifyPlatformAccessToken requires typ==="platform", so a
 * tenant user's token is rejected here even though both realms are signed with the same secret.
 */
export async function authenticatePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new AuthenticationError();

    const payload = verifyPlatformAccessToken(header.slice("Bearer ".length));
    const admin = await prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
    if (!admin || admin.status !== "ACTIVE") {
      throw new AuthenticationError("Platform account is inactive or no longer exists");
    }

    req.platformAdmin = { id: admin.id, username: admin.username, fullName: admin.fullName };
    next();
  } catch (err) {
    if (err instanceof AuthenticationError) return next(err);
    next(new AuthenticationError("Invalid or expired token"));
  }
}
