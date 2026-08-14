import { createPublicKey } from "crypto";
import QRCode from "qrcode";

/**
 * ZATCA QR payload: TLV (Tag-Length-Value) fields, Base64-encoded. A ZATCA-compliant scanner
 * decodes the QR image to get this Base64 string, decodes that to raw TLV bytes, then parses
 * out the fields below.
 *
 * Fields 1-5 (text, Phase 1 / always present): seller name, VAT number, timestamp, invoice
 * total, VAT total.
 * Fields 6-8 (raw binary, Phase C - added once an invoice is signed): invoice hash, digital
 * signature, public key.
 * Field 9 (ZATCA's own signature over our public key) is NOT included yet - it only exists
 * once ZATCA has issued us a real certificate (Phase D). Until then this is an 8-field QR, not
 * the full Phase 2 9-field QR.
 */

export interface QrInput {
  sellerName: string; // ZATCA requires Arabic content - pass the Arabic legal name
  vatNumber: string;
  timestampIso: string;
  invoiceTotal: string; // VAT-inclusive, as a plain decimal string e.g. "115.00"
  vatTotal: string;
}

export interface SignedQrInput extends QrInput {
  invoiceHashBase64: string;
  signatureBase64: string;
  publicKeyPem: string;
}

function tlvField(tag: number, value: Buffer): Buffer {
  if (value.length > 255) {
    throw new Error(`QR TLV field ${tag} exceeds the 255-byte single-byte-length limit`);
  }
  return Buffer.concat([Buffer.from([tag, value.length]), value]);
}

const tlvText = (tag: number, value: string) => tlvField(tag, Buffer.from(value, "utf8"));

export function buildQrTlvBase64(input: QrInput): string {
  const buf = Buffer.concat([
    tlvText(1, input.sellerName),
    tlvText(2, input.vatNumber),
    tlvText(3, input.timestampIso),
    tlvText(4, input.invoiceTotal),
    tlvText(5, input.vatTotal),
  ]);
  return buf.toString("base64");
}

/** Raw uncompressed EC point (0x04 || X || Y) from a SPKI PEM - the format ZATCA's QR field 8 expects, not the PEM wrapper. */
function rawEcPointFromSpkiPem(publicKeyPem: string): Buffer {
  const jwk = createPublicKey(publicKeyPem).export({ format: "jwk" }) as { x: string; y: string };
  return Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
}

export function buildSignedQrTlvBase64(input: SignedQrInput): string {
  const buf = Buffer.concat([
    tlvText(1, input.sellerName),
    tlvText(2, input.vatNumber),
    tlvText(3, input.timestampIso),
    tlvText(4, input.invoiceTotal),
    tlvText(5, input.vatTotal),
    tlvField(6, Buffer.from(input.invoiceHashBase64, "base64")),
    tlvField(7, Buffer.from(input.signatureBase64, "base64")),
    tlvField(8, rawEcPointFromSpkiPem(input.publicKeyPem)),
  ]);
  return buf.toString("base64");
}

export async function renderQrPngDataUrl(qrCodeBase64: string): Promise<string> {
  return QRCode.toDataURL(qrCodeBase64, { margin: 1, scale: 6 });
}
