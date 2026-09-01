import type { BnplProvider } from "@prisma/client";

/**
 * Each provider is its own PaymentMethod code (not one shared "BNPL" code) so the existing
 * payment-method breakdown report shows Tamara/Tabby/MISPay volume separately with no extra work.
 * Seeded per-org in organizations/organization.service.ts createOrganization().
 */
export const PROVIDER_PAYMENT_CODE: Record<BnplProvider, string> = {
  TAMARA: "BNPL_TAMARA",
  TABBY: "BNPL_TABBY",
  MISPAY: "BNPL_MISPAY",
};

export const PAYMENT_CODE_TO_PROVIDER: Record<string, BnplProvider> = {
  BNPL_TAMARA: "TAMARA",
  BNPL_TABBY: "TABBY",
  BNPL_MISPAY: "MISPAY",
};

export const BNPL_PAYMENT_CODES: string[] = Object.values(PROVIDER_PAYMENT_CODE);
