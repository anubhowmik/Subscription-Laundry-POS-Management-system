import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    secret: required("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN ?? "15m",
    refreshSecret: required("JWT_REFRESH_SECRET"),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  },
  defaultCurrency: process.env.DEFAULT_CURRENCY ?? "SAR",
  defaultTimezone: process.env.DEFAULT_TIMEZONE ?? "Asia/Riyadh",
  billing: {
    // "mock" runs the whole subscribe->pay->unlock cycle locally with no real money, so the
    // flow is fully testable before a Moyasar merchant account exists. Switch to "moyasar" (and
    // fill in the keys below) with ONE env change - no code change - once the account is live.
    gateway: (process.env.BILLING_GATEWAY ?? "mock") as "mock" | "moyasar",
    // Where the payment provider sends the customer's browser back to after paying.
    appUrl: process.env.APP_URL ?? "http://localhost:5173",
    moyasar: {
      secretKey: process.env.MOYASAR_SECRET_KEY ?? "",
      publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY ?? "",
      // Shared secret Moyasar signs webhook calls with, so we can trust server-to-server events.
      webhookSecret: process.env.MOYASAR_WEBHOOK_SECRET ?? "",
    },
  },
  email: {
    // "mock" logs the email server-side and (non-production only) echoes the code back in the
    // API response, so the verification flow is fully testable with no real inbox. "resend" uses
    // the Resend API (needs RESEND_API_KEY, restricted to your own address until you verify a
    // sending domain). "smtp" sends through a real mailbox (e.g. Gmail + an app password) via
    // nodemailer - no domain verification needed, delivers to any address immediately. Switch
    // providers with ONE env change - no code change. See modules/notifications/emailSender.ts.
    provider: (process.env.EMAIL_PROVIDER ?? "mock") as "mock" | "resend" | "smtp",
    from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    smtp: {
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: (process.env.SMTP_SECURE ?? "true") === "true",
      user: process.env.SMTP_USER ?? "",
      // A Gmail "app password" (16 chars, generated in Google Account -> Security -> App
      // Passwords), never the account's real login password.
      pass: process.env.SMTP_PASS ?? "",
    },
  },
  zatca: {
    // Base64-encoded 32-byte key for AES-256-GCM encryption of EC private keys / ZATCA
    // secrets at rest. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    encryptionKey: required("ZATCA_ENCRYPTION_KEY"),
    // ZATCA's "Sandbox" (developer-portal) environment - the one you onboard against before
    // going live. UNVERIFIED against a real call as of writing (see docs/POS-ZATCA-PLAN.md
    // Phase D) - correct at time of writing per ZATCA's published developer documentation, but
    // confirm against their current docs before relying on it.
    apiBaseUrl: process.env.ZATCA_API_BASE_URL ?? "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal",
    apiVersion: process.env.ZATCA_API_VERSION ?? "V2",
  },
  isProduction: process.env.NODE_ENV === "production",
};

// True only when there is no real inbox behind the verification email - the mock sender just
// logs server-side, which no one testing signup can actually see. See email.provider above.
export const showDevVerificationCode = !env.isProduction && env.email.provider === "mock";
