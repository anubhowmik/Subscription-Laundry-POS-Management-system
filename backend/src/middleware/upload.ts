import multer from "multer";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { AppError } from "../utils/AppError";

// Reference's own Attach Document allowlist (pdf/csv/zip/doc/docx/jpeg/jpg/png, 9MB) - see
// sale.routes.ts's /documents upload endpoint and pos.service.ts checkout()'s documentPath field.
const SALE_DOCUMENT_EXTENSIONS = new Set([".pdf", ".csv", ".zip", ".doc", ".docx", ".jpeg", ".jpg", ".png"]);
const SALE_DOCUMENT_SIZE_LIMIT = 9 * 1024 * 1024;
const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "sale-documents");

/** Disk storage, one subfolder per organization (never trust the client past the authenticated
 * caller's own org - see the destination callback below) - files get a random UUID name so a
 * guessed/incremented path can't be used to fetch someone else's attachment, and so two uploads
 * of "invoice.pdf" never collide. The original filename is preserved separately in
 * Sale.documentOriginalName for a correct download name later. */
export const uploadSaleDocument = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const organizationId = req.user?.organizationId;
      if (!organizationId) return cb(new AppError(401, "Not authenticated"), "");
      const dir = path.join(UPLOAD_ROOT, organizationId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: SALE_DOCUMENT_SIZE_LIMIT },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!SALE_DOCUMENT_EXTENSIONS.has(ext)) {
      return cb(new AppError(400, "Allowed file types: pdf, csv, zip, doc, docx, jpeg, jpg, png"));
    }
    cb(null, true);
  },
});

const ALLOWED_MIME_TYPES = new Set([
  "text/csv",
  "application/vnd.ms-excel", // some browsers report CSV as this
  "application/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
]);

/** Memory storage (not disk) - files here are small, one-off imports parsed once and discarded,
 * never need to persist past the request. */
export const uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB - a contacts import is a few hundred rows at most
  fileFilter: (_req, file, cb) => {
    const isCsvExt = /\.csv$/i.test(file.originalname);
    const isXlsxExt = /\.xlsx$/i.test(file.originalname);
    if (!isCsvExt && !isXlsxExt && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new AppError(400, "Only .csv or .xlsx files are supported"));
    }
    cb(null, true);
  },
});
