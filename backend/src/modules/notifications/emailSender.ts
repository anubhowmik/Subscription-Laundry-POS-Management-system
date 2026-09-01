import { randomUUID } from "crypto";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

/**
 * An outbound email provider, abstracted the same way paymentGateway.ts abstracts payment
 * providers, for the same reason: nothing in the app should talk to a specific provider's SDK
 * directly. Two implementations exist: `mock` for local development/testing (never sends a
 * real email - logs it and, outside production, echoes the code back so the flow is testable
 * with no real inbox) and `real`, a stub that needs actual provider credentials before it can
 * send anything. Selected via EMAIL_PROVIDER.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SentEmail {
  id: string;
}

export interface EmailSender {
  readonly name: string;
  send(input: SendEmailInput): Promise<SentEmail>;
}

// --- Mock sender ----------------------------------------------------------------------------

const mockSender: EmailSender = {
  name: "mock",
  async send(input) {
    const id = `mock_${randomUUID()}`;
    logger.info({ id, to: input.to, subject: input.subject, text: input.text }, "Mock email sender: would have sent this email");
    return { id };
  },
};

// --- Real sender ------------------------------------------------------------------------------
// UNCONFIGURED - no real provider has been chosen/credentialed yet. This is a clearly-marked
// stub, not a fabricated success: it throws until real credentials exist, the same honesty
// discipline paymentGateway.ts's moyasarGateway follows. Wire in whichever provider is chosen
// (SMTP via nodemailer, or a transactional API like SendGrid/Postmark/Resend/SES) using
// env.email.smtp / env.email.from, and verify against that provider's current docs before
// relying on it - do not fake a delivery.
const realSender: EmailSender = {
  name: "real",
  async send() {
    throw new Error(
      "No real email provider is configured yet. Set EMAIL_PROVIDER=mock for development, or " +
        "implement modules/notifications/emailSender.ts's realSender with real credentials before " +
        "switching EMAIL_PROVIDER=real.",
    );
  },
};

export function getEmailSender(): EmailSender {
  return env.email.provider === "real" ? realSender : mockSender;
}
