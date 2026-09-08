import { randomUUID } from "crypto";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AppError } from "../../utils/AppError";

/**
 * An outbound email provider, abstracted the same way paymentGateway.ts abstracts payment
 * providers, for the same reason: nothing in the app should talk to a specific provider's SDK
 * directly. Three implementations exist: `mock` for local development/testing (never sends a
 * real email - logs it and, outside production, echoes the code back so the flow is testable
 * with no real inbox), `resend` (https://resend.com, restricted to your own address until you
 * verify a sending domain), and `smtp` (a real mailbox via nodemailer - e.g. Gmail + an app
 * password - delivers to any address immediately, no domain to verify). Selected via
 * EMAIL_PROVIDER.
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

// --- Resend sender ----------------------------------------------------------------------------

let resendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!env.email.resendApiKey) {
    throw new AppError(500, "RESEND_API_KEY is not configured - set it in backend/.env before switching EMAIL_PROVIDER=resend");
  }
  resendClient ??= new Resend(env.email.resendApiKey);
  return resendClient;
}

const resendSender: EmailSender = {
  name: "resend",
  async send(input) {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: env.email.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    if (error) {
      logger.error({ error, to: input.to }, "Resend failed to send email");
      throw new AppError(502, `Failed to send email: ${error.message}`);
    }
    return { id: data!.id };
  },
};

// --- SMTP sender (nodemailer) ---------------------------------------------------------------

let smtpTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getSmtpTransporter() {
  if (!env.email.smtp.user || !env.email.smtp.pass) {
    throw new AppError(
      500,
      "SMTP_USER/SMTP_PASS are not configured - set them in backend/.env before switching EMAIL_PROVIDER=smtp",
    );
  }
  smtpTransporter ??= nodemailer.createTransport({
    host: env.email.smtp.host,
    port: env.email.smtp.port,
    secure: env.email.smtp.secure,
    auth: { user: env.email.smtp.user, pass: env.email.smtp.pass },
  });
  return smtpTransporter;
}

const smtpSender: EmailSender = {
  name: "smtp",
  async send(input) {
    const transporter = getSmtpTransporter();
    try {
      const info = await transporter.sendMail({
        from: env.email.from || env.email.smtp.user,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      return { id: info.messageId };
    } catch (err) {
      // Never log err.message verbatim without checking first - some SMTP auth errors echo back
      // the credentials that were tried. This provider only ever logs the recipient and a generic
      // failure marker, matching the "never print sensitive credentials" discipline everywhere
      // else in this module.
      logger.error({ to: input.to }, "SMTP failed to send email");
      throw new AppError(502, "Failed to send email via SMTP - check SMTP_HOST/PORT/USER/PASS in backend/.env");
    }
  },
};

export function getEmailSender(): EmailSender {
  if (env.email.provider === "resend") return resendSender;
  if (env.email.provider === "smtp") return smtpSender;
  return mockSender;
}
