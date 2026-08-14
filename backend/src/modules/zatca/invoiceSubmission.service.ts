import { prisma } from "../../config/prisma";
import { AppError, NotFoundError } from "../../utils/AppError";
import { getProductionCredentials } from "./certificate.service";
import { submitClearance, submitReporting, ZatcaApiError } from "./zatcaApiClient.service";

/**
 * Submits a signed invoice to ZATCA - Clearance for Standard/B2B, Reporting for
 * Simplified/B2C. UNTESTED against a live endpoint (see zatcaApiClient.service.ts). Never
 * called automatically from checkout: this is a separate, explicit action gated on the
 * location actually holding a Production CSID, so POS keeps working normally for locations
 * that haven't finished onboarding.
 */
export async function submitInvoice(saleId: string, organizationId: string) {
  const sale = await prisma.sale.findFirst({ where: { id: saleId, organizationId } });
  if (!sale) throw new NotFoundError("Sale not found");

  if (!sale.xmlContent || !sale.digitalSignature || !sale.invoiceHash) {
    throw new AppError(400, "This sale was not digitally signed - only invoices created after the location's ZATCA certificate existed can be submitted");
  }
  if (sale.clearanceStatus === "CLEARED" || sale.clearanceStatus === "REPORTED") {
    throw new AppError(409, `This invoice was already submitted to ZATCA (status: ${sale.clearanceStatus})`);
  }

  const credentials = await getProductionCredentials(sale.businessLocationId);
  if (!credentials) {
    throw new AppError(400, "This business location does not have a ZATCA Production CSID yet");
  }

  await prisma.sale.update({ where: { id: saleId }, data: { clearanceStatus: "PENDING" } });

  try {
    if (sale.invoiceTypeCode === "STANDARD") {
      const result = await submitClearance(credentials.productionCsid, credentials.productionSecret, sale.xmlContent, sale.invoiceHash, sale.id);
      return await prisma.sale.update({
        where: { id: saleId },
        data: { clearanceStatus: "CLEARED", zatcaSubmittedAt: new Date(), zatcaResponseRaw: result as object },
      });
    }

    const result = await submitReporting(credentials.productionCsid, credentials.productionSecret, sale.xmlContent, sale.invoiceHash, sale.id);
    return await prisma.sale.update({
      where: { id: saleId },
      data: { clearanceStatus: "REPORTED", zatcaSubmittedAt: new Date(), zatcaResponseRaw: result as object },
    });
  } catch (err) {
    const details = err instanceof ZatcaApiError ? (err.details as object) : { message: (err as Error).message };
    await prisma.sale.update({
      where: { id: saleId },
      data: { clearanceStatus: "FAILED", zatcaSubmittedAt: new Date(), zatcaResponseRaw: details },
    });
    throw err;
  }
}
