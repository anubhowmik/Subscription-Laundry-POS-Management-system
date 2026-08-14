import { env } from "../../config/env";
import { AppError } from "../../utils/AppError";

/**
 * HTTP client for ZATCA's e-invoicing (Fatoora) REST API - Compliance CSID exchange,
 * compliance invoice checks, Production CSID exchange, Clearance, and Reporting.
 *
 * STATUS (see docs/POS-ZATCA-PLAN.md Phase D): this has NOT been exercised against a real
 * ZATCA endpoint - there's no confirmed sandbox registration to test against yet. The base
 * URL, endpoint paths, header names, and request/response shapes below follow my best
 * available understanding of ZATCA's published developer documentation, but treat every one of
 * them as "needs confirmation" until the first real call either succeeds or returns a
 * documented error. When you do get sandbox access, the most likely things to need correcting
 * are: exact endpoint paths, the auth header format, and field names in the JSON bodies - the
 * request/response TYPES below are deliberately loose (mostly `unknown`/passthrough) so a
 * mismatch surfaces as "unexpected shape" rather than a silent wrong-field bug.
 */

export class ZatcaApiError extends AppError {
  details: unknown;
  constructor(statusCode: number, message: string, details?: unknown) {
    super(statusCode, message);
    this.details = details;
  }
}

async function zatcaFetch<T>(path: string, init: RequestInit & { headers?: Record<string, string> }): Promise<T> {
  const url = `${env.zatca.apiBaseUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Accept-Version": env.zatca.apiVersion,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch (err) {
    throw new ZatcaApiError(502, `Could not reach ZATCA API at ${url}: ${(err as Error).message}`);
  }

  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    throw new ZatcaApiError(502, `ZATCA API returned HTTP ${response.status} for ${path}`, body);
  }

  return body as T;
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

// --- Compliance CSID (onboarding step 1) ------------------------------------------------

export interface ComplianceCsidResult {
  requestID: string;
  binarySecurityToken: string; // base64-encoded compliance certificate
  secret: string;
  dispositionMessage?: string;
}

export async function requestComplianceCsid(csrPem: string, otp: string): Promise<ComplianceCsidResult> {
  const csrBase64 = Buffer.from(csrPem).toString("base64");
  return zatcaFetch<ComplianceCsidResult>("/compliance", {
    method: "POST",
    headers: { OTP: otp },
    body: JSON.stringify({ csr: csrBase64 }),
  });
}

// --- Compliance invoice checks (onboarding step 2, before Production CSID) --------------

export interface ComplianceInvoiceCheckResult {
  clearanceStatus?: string;
  reportingStatus?: string;
  validationResults?: unknown;
  [key: string]: unknown;
}

export async function submitComplianceInvoice(
  complianceCsid: string,
  complianceSecret: string,
  invoiceXml: string,
  invoiceHash: string,
  uuid: string,
): Promise<ComplianceInvoiceCheckResult> {
  return zatcaFetch<ComplianceInvoiceCheckResult>("/compliance/invoices", {
    method: "POST",
    headers: { Authorization: basicAuthHeader(complianceCsid, complianceSecret) },
    body: JSON.stringify({
      invoiceHash,
      uuid,
      invoice: Buffer.from(invoiceXml).toString("base64"),
    }),
  });
}

// --- Production CSID (onboarding step 3) -------------------------------------------------

export interface ProductionCsidResult {
  requestID: string;
  binarySecurityToken: string;
  secret: string;
  dispositionMessage?: string;
}

export async function requestProductionCsid(
  complianceCsid: string,
  complianceSecret: string,
  complianceRequestId: string,
): Promise<ProductionCsidResult> {
  return zatcaFetch<ProductionCsidResult>("/production/csids", {
    method: "POST",
    headers: { Authorization: basicAuthHeader(complianceCsid, complianceSecret) },
    body: JSON.stringify({ compliance_request_id: complianceRequestId }),
  });
}

// --- Clearance (Standard/B2B invoices - synchronous, pre-delivery) -----------------------

export interface ClearanceResult {
  clearanceStatus: string; // expect "CLEARED"
  clearedInvoice?: string; // base64 XML with ZATCA's stamp applied
  validationResults?: unknown;
  [key: string]: unknown;
}

export async function submitClearance(
  productionCsid: string,
  productionSecret: string,
  invoiceXml: string,
  invoiceHash: string,
  uuid: string,
): Promise<ClearanceResult> {
  return zatcaFetch<ClearanceResult>("/invoices/clearance/single", {
    method: "POST",
    headers: { Authorization: basicAuthHeader(productionCsid, productionSecret), "Clearance-Status": "1" },
    body: JSON.stringify({
      invoiceHash,
      uuid,
      invoice: Buffer.from(invoiceXml).toString("base64"),
    }),
  });
}

// --- Reporting (Simplified/B2C invoices - asynchronous, within 24h of delivery) ----------

export interface ReportingResult {
  reportingStatus: string; // expect "REPORTED"
  validationResults?: unknown;
  [key: string]: unknown;
}

export async function submitReporting(
  productionCsid: string,
  productionSecret: string,
  invoiceXml: string,
  invoiceHash: string,
  uuid: string,
): Promise<ReportingResult> {
  return zatcaFetch<ReportingResult>("/invoices/reporting/single", {
    method: "POST",
    headers: { Authorization: basicAuthHeader(productionCsid, productionSecret) },
    body: JSON.stringify({
      invoiceHash,
      uuid,
      invoice: Buffer.from(invoiceXml).toString("base64"),
    }),
  });
}
