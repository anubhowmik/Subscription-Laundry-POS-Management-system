import { randomUUID } from "crypto";
import type { BnplProvider } from "@prisma/client";

/**
 * A BNPL provider, abstracted the same way billing/paymentGateway.ts abstracts Moyasar. Unlike
 * that module, there is no "real" implementation here at all: Tamara/Tabby/MISPay each have their
 * own API shape and this app has no merchant account or API docs for any of them, so writing a
 * "real" branch would mean inventing request/response payloads that only look like a genuine
 * integration. That is explicitly out of bounds - see docs/REFERENCE-COMPARISON.md §18.3.
 *
 * What exists instead is an honest sandbox simulation per provider: a session is created, it
 * auto-approves itself after a short delay (as if the customer had approved on their phone), and
 * capture is a distinct verified step, exactly mirroring the real CREATED -> APPROVED -> CAPTURED
 * lifecycle these providers actually use. The settings page still lets an org save a merchant
 * token now (see bnplSettings.service.ts) so wiring in a real implementation later is additive,
 * not a rearchitecture - swap `getGateway`'s body for a real per-provider HTTP client.
 */

export interface BnplCreateSessionInput {
  amountSar: number;
  currency: string;
  customerPhone: string;
  metadata: Record<string, string>;
}

export interface BnplCreatedSession {
  providerSessionId: string;
  checkoutUrl: string;
  expiresAt: Date;
}

export type BnplGatewayStatus = "created" | "approved" | "captured" | "failed" | "cancelled" | "expired";

export interface BnplFetchedSession {
  providerSessionId: string;
  status: BnplGatewayStatus;
  amountSar: number;
  raw: unknown;
}

export interface BnplGateway {
  readonly name: string;
  createSession(input: BnplCreateSessionInput): Promise<BnplCreatedSession>;
  /** Re-fetches current status from the "provider" - never trust a client-reported status. */
  getSessionStatus(providerSessionId: string): Promise<BnplFetchedSession | null>;
  /** Only succeeds from "approved"; returns the session unchanged otherwise. */
  capture(providerSessionId: string): Promise<BnplFetchedSession | null>;
}

interface MockSessionRecord {
  amountSar: number;
  createdAt: number;
  status: BnplGatewayStatus;
}

const mockSessions = new Map<string, MockSessionRecord>();

// How long the simulated customer takes to "approve" on their phone after the session is
// created - long enough that a real poll loop is exercised, short enough not to stall testing.
const AUTO_APPROVE_AFTER_MS = 4000;
const SESSION_TTL_MS = 15 * 60 * 1000;

function makeMockGateway(provider: BnplProvider): BnplGateway {
  const label = provider.toLowerCase();
  return {
    name: `${label}-sandbox`,
    async createSession(input) {
      const id = `sandbox_${label}_${randomUUID()}`;
      mockSessions.set(id, { amountSar: input.amountSar, createdAt: Date.now(), status: "created" });
      return {
        providerSessionId: id,
        // Deliberately not a real Tamara/Tabby/MISPay domain - this is a simulated checkout page,
        // never presented as a genuine provider URL.
        checkoutUrl: `https://bnpl-sandbox.internal/${label}/session/${id}`,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      };
    },
    async getSessionStatus(id) {
      const rec = mockSessions.get(id);
      if (!rec) return null;
      if (rec.status === "created" && Date.now() - rec.createdAt > AUTO_APPROVE_AFTER_MS) {
        rec.status = "approved";
      }
      return { providerSessionId: id, status: rec.status, amountSar: rec.amountSar, raw: { sandbox: true, ...rec } };
    },
    async capture(id) {
      const rec = mockSessions.get(id);
      if (!rec) return null;
      if (rec.status === "approved") rec.status = "captured";
      return { providerSessionId: id, status: rec.status, amountSar: rec.amountSar, raw: { sandbox: true, ...rec } };
    },
  };
}

const gatewaysByProvider: Record<BnplProvider, BnplGateway> = {
  TAMARA: makeMockGateway("TAMARA"),
  TABBY: makeMockGateway("TABBY"),
  MISPAY: makeMockGateway("MISPAY"),
};

export function getGateway(provider: BnplProvider): BnplGateway {
  return gatewaysByProvider[provider];
}
