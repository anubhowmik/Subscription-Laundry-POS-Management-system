import { createSign, generateKeyPairSync, sign as cryptoSign, KeyObject } from "crypto";
import * as asn1js from "asn1js";

/**
 * PKCS#10 CSR generation for ZATCA onboarding, using an EC secp256k1 key pair (ZATCA's
 * mandated curve).
 *
 * Node's WebCrypto (`crypto.webcrypto.subtle`) does NOT support secp256k1 - it's outside the
 * W3C standard curve list. `node-forge` was evaluated and rejected: it only supports RSA and
 * Ed25519, not arbitrary EC curves (confirmed by testing, not assumed). So this builds the
 * PKCS#10 ASN.1 structure directly with `asn1js` (a pure structural encoder, curve-agnostic)
 * and delegates key generation/signing to Node's classic `crypto` module (OpenSSL-backed),
 * which does support secp256k1 for both.
 *
 * The Subject DN layout (which standard X.520 RDN each ZATCA-specific value goes into) follows
 * my best available understanding of ZATCA's CSR Generation Guide / reference
 * `csr-config-development.properties` structure: standard CN/O/OU/C plus repurposed
 * serialNumber/title/registeredAddress/businessCategory RDNs for the EGS unit identity, VAT
 * number, invoice-type support flags, address, and industry. All the OIDs used below are
 * standard X.520/PKCS#9 OIDs (not ZATCA inventions), so the ASN.1 plumbing is solid regardless -
 * but the exact semantic mapping (which value goes in which RDN, and the invoice-type flag
 * format) should be checked against ZATCA's currently published CSR guide before a real CSR is
 * submitted to their Compliance CSID endpoint (Phase D). If that mapping has changed, only the
 * constants/values below need updating, not this file's ASN.1 construction logic.
 */

const OID = {
  countryName: "2.5.4.6",
  organizationName: "2.5.4.10",
  organizationalUnitName: "2.5.4.11",
  commonName: "2.5.4.3",
  serialNumber: "2.5.4.5",
  title: "2.5.4.12",
  registeredAddress: "2.5.4.26",
  businessCategory: "2.5.4.15",
  ecdsaWithSha256: "1.2.840.10045.4.3.2",
};

export interface CsrFields {
  commonName: string; // EGS unit common name (e.g. branch name)
  organizationName: string; // legal business name
  organizationalUnitNameVat: string; // VAT registration number
  countryCode?: string; // default "SA"
  egsSerialNumber: string; // "1-<solutionName>|2-<solutionVersion>|3-<serial>"
  invoiceTypeSupport: string; // 4-digit flag string, e.g. "1100"
  locationAddress: string;
  industryBusinessCategory: string;
}

export interface GeneratedKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
  privateKey: KeyObject;
}

export function generateSecp256k1KeyPair(): GeneratedKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "secp256k1" });
  return {
    privateKey,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function utf8Rdn(oid: string, value: string): asn1js.Set {
  return new asn1js.Set({
    value: [
      new asn1js.Sequence({
        value: [new asn1js.ObjectIdentifier({ value: oid }), new asn1js.Utf8String({ value })],
      }),
    ],
  });
}

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const buf = Buffer.from(base64, "base64");
  // Buffer.buffer is the underlying ArrayBuffer, which for small buffers is Node's SHARED
  // memory pool (not sized to this buffer alone) - must slice to byteOffset/byteLength or
  // asn1js ends up parsing unrelated adjacent memory along with the real DER bytes.
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function derToPem(der: Buffer, label: string): string {
  const base64 = der.toString("base64");
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

export function generateCsr(fields: CsrFields, privateKeyPem: string, publicKeyPem: string): string {
  // Subject DN, in the order ZATCA's reference generator conventionally uses.
  const subject = new asn1js.Sequence({
    value: [
      utf8Rdn(OID.countryName, fields.countryCode ?? "SA"),
      utf8Rdn(OID.organizationalUnitName, fields.organizationalUnitNameVat),
      utf8Rdn(OID.organizationName, fields.organizationName),
      utf8Rdn(OID.commonName, fields.commonName),
      utf8Rdn(OID.serialNumber, fields.egsSerialNumber),
      utf8Rdn(OID.title, fields.invoiceTypeSupport),
      utf8Rdn(OID.registeredAddress, fields.locationAddress),
      utf8Rdn(OID.businessCategory, fields.industryBusinessCategory),
    ],
  });

  const spkiDer = pemToDer(publicKeyPem);
  const spkiParsed = asn1js.fromBER(spkiDer);
  if (spkiParsed.offset === -1) throw new Error("Failed to parse generated public key DER");

  // Empty PKCS#10 "attributes" field - context-specific [0] IMPLICIT SET, no extensions requested.
  const attributes = new asn1js.Constructed({
    idBlock: { tagClass: 3, tagNumber: 0 },
    value: [],
  });

  const certificationRequestInfo = new asn1js.Sequence({
    value: [new asn1js.Integer({ value: 0 }), subject, spkiParsed.result, attributes],
  });

  const criDer = Buffer.from(certificationRequestInfo.toBER(false));

  // Node's classic crypto.sign for EC keys outputs a DER-encoded SEQUENCE{r,s} by default -
  // exactly the format X.509/PKCS#10 expects inside the signature BIT STRING.
  const signature = cryptoSign("sha256", criDer, { key: privateKeyPem, dsaEncoding: "der" });

  const signatureAlgorithm = new asn1js.Sequence({
    value: [new asn1js.ObjectIdentifier({ value: OID.ecdsaWithSha256 })],
  });

  const csr = new asn1js.Sequence({
    value: [
      certificationRequestInfo,
      signatureAlgorithm,
      new asn1js.BitString({ valueHex: signature }),
    ],
  });

  const csrDer = Buffer.from(csr.toBER(false));
  return derToPem(csrDer, "CERTIFICATE REQUEST");
}

// Re-exported for tests/verification tooling.
export const _internal = { createSign, OID };
