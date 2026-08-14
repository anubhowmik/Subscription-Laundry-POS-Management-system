import { randomUUID } from "crypto";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

/**
 * A payment provider, abstracted so the billing flow never talks to Moyasar (or any gateway)
 * directly. Two implementations exist: `mock` for local development and automated testing, and
 * `moyasar` for production. Which one is used is decided by BILLING_GATEWAY in the environment.
 *
 * The single most important rule for callers: NEVER treat a browser redirect as proof of
 * payment. The browser can forge any callback URL. Payment is confirmed only by calling
 * `fetchPayment()` here and checking the returned status and amount against our own record.
 */

export interface CreatePaymentInput {
  amountSar: number; // major units, e.g. 299.00
  description: string;
  callbackUrl: string; // where the provider returns the customer's browser after paying
  metadata: Record<string, string>;
}

export interface CreatedPayment {
  id: string; // the gateway's payment id
  redirectUrl: string; // hosted payment page to send the customer to
}

export interface FetchedPayment {
  id: string;
  status: "initiated" | "paid" | "failed";
  amountSar: number; // what the gateway says was actually charged
  raw: unknown;
}

export interface PaymentGateway {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  /** Returns null when the id is unknown to the gateway (e.g. a forged callback). */
  fetchPayment(id: string): Promise<FetchedPayment | null>;
}

// --- Mock gateway -------------------------------------------------------------------------
// Simulates a hosted checkout that always succeeds. It remembers the amount of each payment it
// created so fetchPayment can report it back, exactly as a real gateway would - which lets the
// amount-tampering and forged-id defenses be tested without real money.

const mockPayments = new Map<string, { amountSar: number }>();

const mockGateway: PaymentGateway = {
  name: "mock",
  async createPayment(input) {
    const id = `mock_${randomUUID()}`;
    mockPayments.set(id, { amountSar: input.amountSar });
    const url = new URL(input.callbackUrl);
    url.searchParams.set("id", id);
    url.searchParams.set("status", "paid");
    return { id, redirectUrl: url.toString() };
  },
  async fetchPayment(id) {
    const rec = mockPayments.get(id);
    if (!rec) return null; // unknown/forged id
    return { id, status: "paid", amountSar: rec.amountSar, raw: { mock: true } };
  },
};

// --- Moyasar gateway ----------------------------------------------------------------------
// UNTESTED against live Moyasar - there is no merchant account yet. Uses the Invoices API,
// which returns a hosted page URL to redirect the customer to. Kept minimal and clearly
// marked; verify against Moyasar's current docs before going live.

const MOYASAR_BASE = "https://api.moyasar.com/v1";

function moyasarAuthHeader(): string {
  // Moyasar uses HTTP Basic auth with the secret key as the username and an empty password.
  return "Basic " + Buffer.from(`${env.billing.moyasar.secretKey}:`).toString("base64");
}

const moyasarGateway: PaymentGateway = {
  name: "moyasar",
  async createPayment(input) {
    const res = await fetch(`${MOYASAR_BASE}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: moyasarAuthHeader() },
      body: JSON.stringify({
        amount: Math.round(input.amountSar * 100), // Moyasar works in halalas
        currency: "SAR",
        description: input.description,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      logger.error({ status: res.status, detail }, "Moyasar createPayment failed");
      throw new Error(`Moyasar rejected the payment request (${res.status})`);
    }
    const body = (await res.json()) as { id: string; url: string };
    return { id: body.id, redirectUrl: body.url };
  },
  async fetchPayment(id) {
    const res = await fetch(`${MOYASAR_BASE}/invoices/${id}`, {
      headers: { Authorization: moyasarAuthHeader() },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Moyasar fetchPayment failed (${res.status})`);
    const body = (await res.json()) as { id: string; status: string; amount: number };
    const status = body.status === "paid" ? "paid" : body.status === "initiated" ? "initiated" : "failed";
    return { id: body.id, status, amountSar: body.amount / 100, raw: body };
  },
};

export function getGateway(): PaymentGateway {
  return env.billing.gateway === "moyasar" ? moyasarGateway : mockGateway;
}
