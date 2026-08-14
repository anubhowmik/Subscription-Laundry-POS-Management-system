import { KeyObject, createPrivateKey } from "crypto";
import { prisma } from "../../config/prisma";
import { AppError, ConflictError, NotFoundError } from "../../utils/AppError";
import { encryptSecret, decryptSecret } from "../../utils/secretBox";
import { generateSecp256k1KeyPair, generateCsr } from "./csrGenerator.service";
import { requestComplianceCsid, requestProductionCsid, ZatcaApiError } from "./zatcaApiClient.service";

// See docs/POS-ZATCA-PLAN.md Phase C for why "1100" here needs verification against ZATCA's
// current CSR guide before real submission - it declares which invoice/note types this EGS
// unit supports and its exact bit meaning isn't something I can guarantee byte-for-byte.
const DEFAULT_INVOICE_TYPE_SUPPORT = "1100";
const DEFAULT_INDUSTRY_CATEGORY = "Laundry and Dry Cleaning Services";
const EGS_SOLUTION_NAME = "LaundryPOS";
const EGS_SOLUTION_VERSION = "1.0.0";

export async function generateForLocation(businessLocationId: string, organizationId: string) {
  const location = await prisma.businessLocation.findFirst({ where: { id: businessLocationId, organizationId } });
  if (!location) throw new NotFoundError("Business location not found");

  if (!location.vatNumber?.trim()) {
    throw new AppError(400, "Set this business location's VAT number before generating a ZATCA certificate");
  }

  const existing = await prisma.zatcaDeviceCertificate.findUnique({ where: { businessLocationId } });
  if (existing) {
    throw new ConflictError("A ZATCA certificate already exists for this business location");
  }

  const { privateKeyPem, publicKeyPem } = generateSecp256k1KeyPair();

  const csrPem = generateCsr(
    {
      commonName: `${location.branchName} EGS`,
      organizationName: location.businessNameEn,
      organizationalUnitNameVat: location.vatNumber,
      egsSerialNumber: `1-${EGS_SOLUTION_NAME}|2-${EGS_SOLUTION_VERSION}|3-${location.branchCode}`,
      invoiceTypeSupport: DEFAULT_INVOICE_TYPE_SUPPORT,
      locationAddress: location.address || location.city || location.nationalAddress || "Saudi Arabia",
      industryBusinessCategory: DEFAULT_INDUSTRY_CATEGORY,
    },
    privateKeyPem,
    publicKeyPem,
  );

  return prisma.zatcaDeviceCertificate.create({
    data: {
      businessLocationId,
      privateKeyEncrypted: encryptSecret(privateKeyPem),
      publicKeyPem,
      csrPem,
      status: "KEY_GENERATED",
    },
    select: {
      id: true,
      businessLocationId: true,
      publicKeyPem: true,
      csrPem: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function getStatus(businessLocationId: string, organizationId: string) {
  const cert = await prisma.zatcaDeviceCertificate.findFirst({
    where: { businessLocationId, businessLocation: { organizationId } },
    select: {
      id: true,
      businessLocationId: true,
      publicKeyPem: true,
      csrPem: true,
      status: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!cert) throw new NotFoundError("No ZATCA certificate exists yet for this business location");
  return cert;
}

export interface SigningMaterial {
  privateKey: KeyObject;
  privateKeyPem: string;
  publicKeyPem: string;
}

/** Returns null (not an error) when the location hasn't been onboarded yet - callers use this to decide whether to fall back to the Phase A hash-only path. */
export async function getSigningMaterial(businessLocationId: string): Promise<SigningMaterial | null> {
  const cert = await prisma.zatcaDeviceCertificate.findUnique({ where: { businessLocationId } });
  if (!cert) return null;

  const privateKeyPem = decryptSecret(cert.privateKeyEncrypted);
  return {
    privateKey: createPrivateKey(privateKeyPem),
    privateKeyPem,
    publicKeyPem: cert.publicKeyPem,
  };
}

// --- Phase D: real calls to ZATCA's onboarding API ----------------------------------------
// UNTESTED against a live endpoint - see zatcaApiClient.service.ts header comment.

function formatZatcaError(err: unknown): string {
  if (err instanceof ZatcaApiError) {
    const detail = typeof err.details === "string" ? err.details : JSON.stringify(err.details);
    return `${err.message} - ${detail}`.slice(0, 1000);
  }
  return (err as Error).message;
}

export async function exchangeComplianceCsid(businessLocationId: string, otp: string, organizationId: string) {
  const cert = await prisma.zatcaDeviceCertificate.findFirst({ where: { businessLocationId, businessLocation: { organizationId } } });
  if (!cert) throw new NotFoundError("Generate a CSR for this location first");
  if (!cert.csrPem) throw new AppError(400, "This certificate record has no CSR stored");
  if (cert.status !== "KEY_GENERATED") {
    throw new ConflictError(`Certificate is already past the CSR stage (status: ${cert.status})`);
  }

  try {
    const result = await requestComplianceCsid(cert.csrPem, otp);
    return await prisma.zatcaDeviceCertificate.update({
      where: { businessLocationId },
      data: {
        complianceRequestId: result.requestID,
        complianceCsid: result.binarySecurityToken,
        complianceSecretEncrypted: encryptSecret(result.secret),
        status: "COMPLIANCE_ISSUED",
        lastError: null,
      },
      select: { id: true, status: true, complianceRequestId: true, updatedAt: true },
    });
  } catch (err) {
    const message = formatZatcaError(err);
    await prisma.zatcaDeviceCertificate.update({ where: { businessLocationId }, data: { status: "FAILED", lastError: message } });
    throw err;
  }
}

export async function exchangeProductionCsid(businessLocationId: string, organizationId: string) {
  const cert = await prisma.zatcaDeviceCertificate.findFirst({ where: { businessLocationId, businessLocation: { organizationId } } });
  if (!cert) throw new NotFoundError("No ZATCA certificate exists yet for this business location");
  if (cert.status !== "COMPLIANCE_ISSUED" || !cert.complianceCsid || !cert.complianceSecretEncrypted || !cert.complianceRequestId) {
    throw new ConflictError("Get a Compliance CSID before requesting a Production CSID");
  }

  try {
    const complianceSecret = decryptSecret(cert.complianceSecretEncrypted);
    const result = await requestProductionCsid(cert.complianceCsid, complianceSecret, cert.complianceRequestId);
    return await prisma.zatcaDeviceCertificate.update({
      where: { businessLocationId },
      data: {
        productionCsid: result.binarySecurityToken,
        productionSecretEncrypted: encryptSecret(result.secret),
        status: "PRODUCTION_ISSUED",
        lastError: null,
      },
      select: { id: true, status: true, updatedAt: true },
    });
  } catch (err) {
    const message = formatZatcaError(err);
    await prisma.zatcaDeviceCertificate.update({ where: { businessLocationId }, data: { lastError: message } });
    throw err;
  }
}

export interface ProductionCredentials {
  productionCsid: string;
  productionSecret: string;
}

export async function getProductionCredentials(businessLocationId: string): Promise<ProductionCredentials | null> {
  const cert = await prisma.zatcaDeviceCertificate.findUnique({ where: { businessLocationId } });
  if (!cert || cert.status !== "PRODUCTION_ISSUED" || !cert.productionCsid || !cert.productionSecretEncrypted) return null;
  return { productionCsid: cert.productionCsid, productionSecret: decryptSecret(cert.productionSecretEncrypted) };
}
