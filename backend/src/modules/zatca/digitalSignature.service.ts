import { sign as cryptoSign, verify as cryptoVerify } from "crypto";

/**
 * ECDSA-with-SHA256 signing of the invoice XML. Node computes the SHA256 digest internally as
 * part of the sign operation (standard ecdsa-with-SHA256 behavior, equivalent to
 * `openssl dgst -sha256 -sign key.pem invoice.xml`) - this is a separate call from
 * hashChain.service's computeXmlInvoiceHash, but both operate over the same XML bytes, so the
 * chain hash and the signature are consistent representations of the same document.
 */

export function signInvoiceXml(xml: string, privateKeyPem: string): string {
  const signature = cryptoSign("sha256", Buffer.from(xml, "utf8"), { key: privateKeyPem, dsaEncoding: "der" });
  return signature.toString("base64");
}

export function verifyInvoiceSignature(xml: string, signatureBase64: string, publicKeyPem: string): boolean {
  return cryptoVerify(
    "sha256",
    Buffer.from(xml, "utf8"),
    { key: publicKeyPem, dsaEncoding: "der" },
    Buffer.from(signatureBase64, "base64"),
  );
}
