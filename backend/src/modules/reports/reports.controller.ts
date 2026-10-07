import { Request, Response } from "express";
import * as service from "./reports.service";
import * as dailyProducts from "./dailyProductsReport.service";
import * as companies from "./companiesReport.service";
import * as detailedCompanies from "./detailedCompaniesReport.service";
import * as products from "./productsReport.service";
import * as salesV2 from "./salesReport.service";
import * as detailedSales from "./detailedSalesReport.service";
import * as branchSales from "./branchSalesReport.service";
import * as tax from "./taxReport.service";
import * as register from "./registerReport.service";
import * as compensations from "./compensationsReport.service";
import * as cashback from "./cashbackReport.service";
import * as loyaltyPoints from "./loyaltyPointsReport.service";
import * as cashRegister from "./cashRegisterReport.service";
import * as customerVisits from "./customerVisitsReport.service";
import { prisma } from "../../config/prisma";
import { customerSearch } from "../paymentAccounts/paymentAccount.service";
import { sendSuccess } from "../../utils/apiResponse";
import { reportOptions, sendXlsx } from "./reportCommon";

export async function salesReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.salesReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function accountingReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.accountingReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function inventoryReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.inventoryReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function salesByServiceReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.salesByServiceReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function arAgingReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.arAgingReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function apAgingReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.apAgingReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function staffProductivityReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.staffProductivityReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function vatBreakdownReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.vatBreakdownReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function dailyProductsReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await dailyProducts.dailyProductsReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function dailyProductsReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await dailyProducts.dailyProductsReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

export async function reportFilterOptions(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await reportOptions(req.user!.organizationId, allowedLocationIds));
}

export async function companiesReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await companies.companiesReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function companiesReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await companies.companiesReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

export async function detailedCompaniesReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await detailedCompanies.detailedCompaniesReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function detailedCompaniesReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await detailedCompanies.detailedCompaniesReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

export async function productsReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await products.productsReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function productsReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await products.productsReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

export async function salesReportV2(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await salesV2.salesReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function salesReportV2Export(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await salesV2.salesReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

export async function detailedSalesReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await detailedSales.detailedSalesReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function detailedSalesReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await detailedSales.detailedSalesReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

export async function branchSalesReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await branchSales.branchSalesReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function branchSalesReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await branchSales.branchSalesReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

export async function taxReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await tax.taxReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function taxReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await tax.taxReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

export async function registerReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await register.registerReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function registerReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await register.registerReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

/** Customer picker for the reports' Contact filter - served here so report-only users can use it. */
export async function reportCustomerSearch(req: Request, res: Response) {
  return sendSuccess(res, await customerSearch(String(req.query.search ?? ""), req.user!.organizationId));
}

export async function compensationsReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await compensations.compensationsReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function compensationsReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await compensations.compensationsReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

export async function cashbackReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await cashback.cashbackReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function cashbackReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await cashback.cashbackReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

export async function loyaltyPointsReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await loyaltyPoints.loyaltyPointsReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function loyaltyPointsReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await loyaltyPoints.loyaltyPointsReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}

export async function cashRegisterReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await cashRegister.cashRegisterReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function cashRegisterReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const viewer = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { fullNameEn: true, fullNameAr: true } });
  const viewerName = req.query.lang === "ar" ? viewer.fullNameAr || viewer.fullNameEn : viewer.fullNameEn;
  const { workbook, filename } = await cashRegister.cashRegisterReportXlsx(req.query, req.user!.organizationId, allowedLocationIds, viewerName);
  return sendXlsx(res, workbook, filename);
}

export async function customerVisitsReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await customerVisits.customerVisitsReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function customerVisitsReportExport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { workbook, filename } = await customerVisits.customerVisitsReportXlsx(req.query, req.user!.organizationId, allowedLocationIds);
  return sendXlsx(res, workbook, filename);
}
