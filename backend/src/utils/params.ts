import { Request } from "express";
import { AppError } from "./AppError";

/**
 * Express 5's ParamsDictionary types values as `string | string[]` to allow
 * repeated route segments (path-to-regexp v8). None of our routes use that
 * feature, so every param here is expected to be a single string.
 */
export function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") {
    throw new AppError(400, `Missing or invalid route parameter: ${name}`);
  }
  return value;
}
