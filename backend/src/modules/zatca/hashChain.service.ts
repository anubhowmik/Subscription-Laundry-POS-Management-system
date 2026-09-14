import { createHash } from "crypto";

/**
 * ZATCA invoice hash chain.
 *
 * `computeXmlInvoiceHash` (Phase C) is used once a business location has a signing key: it
 * hashes the actual UBL XML bytes (xmlbuilder2's serialization is deterministic for a given
 * input, so the same invoice always hashes the same way - real tamper-evidence). This is NOT
 * yet verified as byte-identical to W3C XML-C14N, which is what ZATCA's own hash validation
 * expects; that only matters once we're submitting to their Compliance API (Phase D) - for our
 * own local chain integrity, deterministic serialization is sufficient.
 *
 * `computeInvoiceHash` (Phase A) remains as the fallback for locations that haven't generated
 * a signing key yet - same chain-linking mechanism, hashing a JSON-shaped summary instead of
 * XML. Never mixed within one location's chain: whichever function produced the previous link
 * determines what's hashed, but both produce the same kind of opaque base64 hash so the chain
 * itself doesn't care which one made a given link.
 */

// ZATCA's defined seed value for the first invoice in a chain: base64(SHA-256("0")), NOT
// base64("0") - confirmed against the reference implementation's own hardcoded genesis constant
// (SellPosController.php). Getting this wrong means every location's very first invoice carries
// an incorrect PIH, which ZATCA validates explicitly.
export const GENESIS_PREVIOUS_HASH = "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

export interface InvoiceHashLine {
  description: string;
  quantity: string;
  unitPrice: string;
  taxAmount: string;
  total: string;
}

export interface InvoiceHashInput {
  businessLocationId: string;
  icv: number;
  invoiceTypeCode: string;
  transactionTypeCode: string;
  invoiceNumber: string;
  saleDateIso: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  items: InvoiceHashLine[];
}

export function computeInvoiceHash(previousInvoiceHash: string, input: InvoiceHashInput): string {
  const itemsPart = input.items
    .map((i) => `${i.description}|${i.quantity}|${i.unitPrice}|${i.taxAmount}|${i.total}`)
    .join(";");

  const canonical = [
    previousInvoiceHash,
    input.businessLocationId,
    String(input.icv),
    input.invoiceTypeCode,
    input.transactionTypeCode,
    input.invoiceNumber,
    input.saleDateIso,
    input.subtotal,
    input.taxAmount,
    input.totalAmount,
    itemsPart,
  ].join("\n");

  return createHash("sha256").update(canonical, "utf8").digest("base64");
}

export function computeXmlInvoiceHash(xml: string): string {
  return createHash("sha256").update(xml, "utf8").digest("base64");
}
