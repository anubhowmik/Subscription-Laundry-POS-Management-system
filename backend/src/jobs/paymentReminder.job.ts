import cron from "node-cron";
import { prisma } from "../config/prisma";
import { sendTemplatedSms } from "../modules/notifications/notifications.service";
import { logger } from "../config/logger";

/**
 * Scans every org with paymentReminderEnabled for overdue FINAL sales and sends a PAYMENT_REMINDER
 * SMS, respecting each org's own after-days/interval-days config. lastReminderSentAt is the dedup
 * guard - without it this would resend every single hourly tick for the same invoice forever.
 */
export async function runPaymentReminders() {
  const orgs = await prisma.organization.findMany({
    where: { paymentReminderEnabled: true },
    select: { id: true, paymentReminderAfterDays: true, paymentReminderIntervalDays: true },
  });

  for (const org of orgs) {
    const now = Date.now();
    const afterCutoff = new Date(now - org.paymentReminderAfterDays * 24 * 60 * 60 * 1000);
    const intervalCutoff = new Date(now - org.paymentReminderIntervalDays * 24 * 60 * 60 * 1000);

    const overdueSales = await prisma.sale.findMany({
      where: {
        organizationId: org.id,
        status: "FINAL",
        dueAmount: { gt: 0 },
        paymentStatus: { in: ["DUE", "PARTIAL"] },
        saleDate: { lte: afterCutoff },
        OR: [{ lastReminderSentAt: null }, { lastReminderSentAt: { lte: intervalCutoff } }],
      },
      select: { id: true, invoiceNumber: true, dueAmount: true, customer: { select: { phone: true } } },
    });

    for (const sale of overdueSales) {
      if (!sale.customer.phone) continue;
      await sendTemplatedSms(
        org.id,
        "PAYMENT_REMINDER",
        sale.customer.phone,
        { invoiceNumber: sale.invoiceNumber ?? "", dueAmount: sale.dueAmount.toFixed(2) },
        "SALE",
        sale.id,
      );
      await prisma.sale.update({ where: { id: sale.id }, data: { lastReminderSentAt: new Date() } });
    }
  }
}

export function startPaymentReminderJob() {
  cron.schedule("0 * * * *", () => {
    runPaymentReminders().catch((err) => logger.error({ err }, "Payment reminder job failed"));
  });
}
