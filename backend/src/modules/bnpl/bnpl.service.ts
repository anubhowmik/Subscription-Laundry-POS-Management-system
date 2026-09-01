import type { BnplProvider, BnplSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError } from "../../utils/AppError";
import { getGateway, type BnplGatewayStatus } from "./bnplGateway";
import { isProviderEnabled } from "./bnplSettings.service";

const GATEWAY_TO_SESSION_STATUS: Record<BnplGatewayStatus, BnplSessionStatus> = {
  created: "CREATED",
  approved: "APPROVED",
  captured: "CAPTURED",
  failed: "FAILED",
  cancelled: "CANCELLED",
  expired: "EXPIRED",
};

const TERMINAL_STATUSES: BnplSessionStatus[] = ["CAPTURED", "FAILED", "CANCELLED", "EXPIRED"];

interface CreateSessionInput {
  organizationId: string;
  businessLocationId: string;
  provider: BnplProvider;
  amount: number;
  customerId: string;
  customerPhone: string;
  createdBy: string;
}

export async function createSession(input: CreateSessionInput) {
  const enabled = await isProviderEnabled(input.provider, input.organizationId);
  if (!enabled) {
    throw new AppError(400, `${input.provider} is not enabled for this organization - configure it under Settings first`);
  }

  const gateway = getGateway(input.provider);
  const created = await gateway.createSession({
    amountSar: input.amount,
    currency: "SAR",
    customerPhone: input.customerPhone,
    metadata: { organizationId: input.organizationId, customerId: input.customerId },
  });

  return prisma.bnplSession.create({
    data: {
      organizationId: input.organizationId,
      businessLocationId: input.businessLocationId,
      provider: input.provider,
      providerSessionId: created.providerSessionId,
      status: "CREATED",
      amount: input.amount,
      customerId: input.customerId,
      customerPhone: input.customerPhone,
      checkoutUrl: created.checkoutUrl,
      expiresAt: created.expiresAt,
      createdBy: input.createdBy,
    },
  });
}

async function loadSession(id: string, organizationId: string) {
  const session = await prisma.bnplSession.findFirst({ where: { id, organizationId } });
  if (!session) throw new NotFoundError("BNPL session not found");
  return session;
}

/** Re-fetches from the gateway and persists any change - never trusts the DB's last-known status
 * as current without checking, and never trusts a client-reported status at all. */
export async function getSessionStatus(id: string, organizationId: string) {
  const session = await loadSession(id, organizationId);
  if (TERMINAL_STATUSES.includes(session.status)) return session;

  const gateway = getGateway(session.provider);
  const fetched = await gateway.getSessionStatus(session.providerSessionId);
  if (!fetched) {
    return prisma.bnplSession.update({ where: { id }, data: { status: "FAILED", failureReason: "Session not found at provider" } });
  }

  let status = GATEWAY_TO_SESSION_STATUS[fetched.status];
  if (status !== "CAPTURED" && new Date() > session.expiresAt) status = "EXPIRED";

  if (status === session.status) return session;
  return prisma.bnplSession.update({
    where: { id },
    data: { status, rawLastResponse: fetched.raw as Prisma.InputJsonValue },
  });
}

/** Fired automatically by the frontend the instant its poll observes APPROVED - no cashier click.
 * Still re-verifies with the gateway before committing, matching billing.service.ts's
 * "never trust, always re-check" discipline. */
export async function captureSession(id: string, organizationId: string) {
  const session = await getSessionStatus(id, organizationId);
  if (session.status === "CAPTURED") return session;
  if (session.status !== "APPROVED") {
    throw new AppError(400, `Cannot capture a session in status ${session.status}`);
  }

  const gateway = getGateway(session.provider);
  const captured = await gateway.capture(session.providerSessionId);
  if (!captured || captured.status !== "captured") {
    throw new AppError(400, "The provider did not confirm capture");
  }

  return prisma.bnplSession.update({
    where: { id: session.id },
    data: { status: "CAPTURED", rawLastResponse: captured.raw as Prisma.InputJsonValue },
  });
}

/**
 * The only way a BnplSession becomes usable on a sale. Called from inside pos.service.ts's
 * checkout()/confirmQuote() transaction, after the Payment row has been inserted. Re-checks
 * everything from the database row inside the transaction rather than trusting the caller's
 * belief that the session is good - status, single-use (via the saleId @unique constraint),
 * amount, and that it has not expired since capture (a cashier delay between capture and
 * finishing checkout).
 */
export async function verifyAndConsumeSessionTx(
  tx: Prisma.TransactionClient,
  sessionId: string,
  saleId: string,
  expectedAmount: Prisma.Decimal.Value,
  organizationId: string,
) {
  const session = await tx.bnplSession.findFirst({ where: { id: sessionId, organizationId } });
  if (!session) throw new AppError(400, "BNPL session not found");
  if (session.status !== "CAPTURED") throw new AppError(400, `BNPL session is not captured (status: ${session.status})`);
  if (session.saleId) throw new AppError(400, "This BNPL session has already been used on another sale");
  if (session.expiresAt < new Date()) throw new AppError(400, "This BNPL session has expired since it was captured - start a new one");
  if (!session.amount.equals(expectedAmount)) {
    throw new AppError(400, `BNPL session amount (${session.amount.toFixed(2)}) does not match the payment amount`);
  }

  await tx.bnplSession.update({ where: { id: session.id }, data: { saleId } });
  return session;
}
