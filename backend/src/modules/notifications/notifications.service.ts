import { prisma } from "../../config/prisma";
import { encryptSecret, decryptSecret } from "../../utils/secretBox";
import { sendUnifonicSms } from "./unifonicAdapter";
import { getEmailSender } from "./emailSender";
import { NOTIFICATION_TEMPLATE_DEFS, type NotificationTemplateDef } from "../../config/notificationTemplates";

type NotificationTrigger = NotificationTemplateDef["trigger"];

export async function getSettings(organizationId: string) {
  const settings = await prisma.notificationSettings.findUnique({ where: { organizationId } });
  return {
    provider: settings?.provider ?? "UNIFONIC",
    senderId: settings?.senderId ?? null,
    enabled: settings?.enabled ?? false,
    // The AppSid itself is never sent back to the client once saved - only whether one exists.
    hasAppSid: Boolean(settings?.appSidEncrypted),
  };
}

interface UpdateSettingsInput {
  appSid?: string;
  senderId?: string;
  enabled: boolean;
}

export async function updateSettings(input: UpdateSettingsInput, organizationId: string) {
  const existing = await prisma.notificationSettings.findUnique({ where: { organizationId } });

  const appSidEncrypted = input.appSid ? encryptSecret(input.appSid) : existing?.appSidEncrypted;

  const settings = await prisma.notificationSettings.upsert({
    where: { organizationId },
    update: { appSidEncrypted, senderId: input.senderId ?? existing?.senderId, enabled: input.enabled },
    create: { organizationId, appSidEncrypted, senderId: input.senderId, enabled: input.enabled },
  });

  return { provider: settings.provider, senderId: settings.senderId, enabled: settings.enabled, hasAppSid: Boolean(settings.appSidEncrypted) };
}

export async function listRecentLogs(organizationId: string) {
  return prisma.notificationLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Every org's 6 templates, seeded from NOTIFICATION_TEMPLATE_DEFS for any trigger that doesn't
 * have a persisted row yet - so a template always has a real EN/AR message to show/edit, even for
 * an org whose registration predates a newly-added trigger. */
export async function listTemplates(organizationId: string) {
  const existing = await prisma.notificationTemplate.findMany({ where: { organizationId } });
  const byTrigger = new Map(existing.map((t) => [t.trigger, t]));
  return NOTIFICATION_TEMPLATE_DEFS.map((def) => {
    const row = byTrigger.get(def.trigger);
    return {
      trigger: def.trigger,
      messageEn: row?.messageEn ?? def.messageEn,
      messageAr: row?.messageAr ?? def.messageAr,
      isEnabled: row?.isEnabled ?? true,
    };
  });
}

interface UpdateTemplateInput {
  messageEn: string;
  messageAr: string;
  isEnabled: boolean;
}

export async function updateTemplate(trigger: NotificationTrigger, input: UpdateTemplateInput, organizationId: string) {
  return prisma.notificationTemplate.upsert({
    where: { organizationId_trigger: { organizationId, trigger } },
    update: input,
    create: { organizationId, trigger, ...input },
  });
}

/**
 * Loads the org's template for `trigger` (falling back to the built-in default if the org has
 * never customized it), substitutes `{placeholder}` tokens, and sends via the existing sendSms -
 * skips the send entirely if the org has disabled that specific trigger.
 */
export async function sendTemplatedSms(
  organizationId: string,
  trigger: NotificationTrigger,
  toPhone: string,
  placeholders: Record<string, string>,
  referenceType?: string,
  referenceId?: string,
) {
  const row = await prisma.notificationTemplate.findUnique({ where: { organizationId_trigger: { organizationId, trigger } } });
  if (row && !row.isEnabled) return;

  const def = NOTIFICATION_TEMPLATE_DEFS.find((d) => d.trigger === trigger)!;
  const template = row ?? def;

  function fill(text: string) {
    let out = text;
    for (const [key, value] of Object.entries(placeholders)) {
      out = out.split(`{${key}}`).join(value);
    }
    return out;
  }

  // No per-customer language preference exists in the schema yet, so - matching how the rest of
  // the app treats Arabic as the primary customer-facing language (e.g. the ZATCA QR seller name)
  // while still honoring an admin's English customization - both languages are sent together.
  const message = `${fill(template.messageEn)}\n${fill(template.messageAr)}`;

  await sendSms(organizationId, toPhone, message, referenceType, referenceId);
}

/**
 * Same template-load-and-substitute pipeline as sendTemplatedSms(), but for the "Send
 * Notification" row action's email channel (QuotesPage.tsx) - the first trigger sent by email in
 * this app, so there's no per-trigger customizable subject line yet (see notificationTemplates.ts
 * comment); `subject` is provided by the caller instead, with placeholders already substituted
 * into it just like the body. Never throws - a failed notification must never block the row
 * action that triggered it; logs a NotificationLog row either way, same as sendSms().
 */
export async function sendTemplatedEmail(
  organizationId: string,
  trigger: NotificationTrigger,
  toEmail: string,
  subject: string,
  placeholders: Record<string, string>,
  referenceType?: string,
  referenceId?: string,
) {
  const row = await prisma.notificationTemplate.findUnique({ where: { organizationId_trigger: { organizationId, trigger } } });
  if (row && !row.isEnabled) return;

  const def = NOTIFICATION_TEMPLATE_DEFS.find((d) => d.trigger === trigger)!;
  const template = row ?? def;

  function fill(text: string) {
    let out = text;
    for (const [key, value] of Object.entries(placeholders)) {
      out = out.split(`{${key}}`).join(value);
    }
    return out;
  }

  // Same "send both languages together" reasoning as sendTemplatedSms() - no per-customer
  // language preference exists in the schema yet.
  const bodyEn = fill(template.messageEn);
  const bodyAr = fill(template.messageAr);
  const text = `${bodyEn}\n\n${bodyAr}`;
  const html = `<p>${bodyEn}</p><hr/><p dir="rtl">${bodyAr}</p>`;

  try {
    await getEmailSender().send({ to: toEmail, subject, text, html });
    await prisma.notificationLog.create({
      // toPhone holds the recipient email here - NotificationLog predates any non-SMS channel and
      // has no separate toEmail column; reusing it keeps one log table for both channels rather
      // than a schema split for a single trigger.
      data: { organizationId, toPhone: toEmail, message: text, status: "SENT", provider: "RESEND", referenceType, referenceId },
    });
  } catch (err) {
    await prisma.notificationLog.create({
      data: {
        organizationId,
        toPhone: toEmail,
        message: text,
        status: "FAILED",
        provider: "RESEND",
        referenceType,
        referenceId,
        errorMessage: err instanceof Error ? err.message : "Unknown error sending email",
      },
    });
  }
}

/**
 * Sends (or, if the tenant hasn't configured/enabled a provider yet, just logs) a text message.
 * Never throws - a notification failing must never break the order-status update or checkout
 * flow that triggered it. Callers should fire this without awaiting if they don't need the result.
 */
export async function sendSms(organizationId: string, toPhone: string, message: string, referenceType?: string, referenceId?: string) {
  const settings = await prisma.notificationSettings.findUnique({ where: { organizationId } });

  if (!settings?.enabled || !settings.appSidEncrypted || !settings.senderId) {
    await prisma.notificationLog.create({
      data: { organizationId, toPhone, message, status: "TEST", provider: "UNIFONIC", referenceType, referenceId },
    });
    return;
  }

  try {
    const appSid = decryptSecret(settings.appSidEncrypted);
    const result = await sendUnifonicSms(appSid, settings.senderId, toPhone, message);
    await prisma.notificationLog.create({
      data: {
        organizationId,
        toPhone,
        message,
        status: result.success ? "SENT" : "FAILED",
        provider: "UNIFONIC",
        referenceType,
        referenceId,
        errorMessage: result.success ? null : result.errorMessage,
      },
    });
  } catch (err) {
    await prisma.notificationLog.create({
      data: {
        organizationId,
        toPhone,
        message,
        status: "FAILED",
        provider: "UNIFONIC",
        referenceType,
        referenceId,
        errorMessage: err instanceof Error ? err.message : "Unknown error sending SMS",
      },
    });
  }
}
