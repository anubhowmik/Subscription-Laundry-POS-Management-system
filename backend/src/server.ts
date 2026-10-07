import "./config/timezone";
import app from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";
import { startPaymentReminderJob } from "./jobs/paymentReminder.job";
import { startRecurringExpenseJob } from "./jobs/recurringExpense.job";

const server = app.listen(env.port, () => {
  logger.info(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  logger.info(`Swagger docs at http://localhost:${env.port}/api/docs`);
});

startPaymentReminderJob();
startRecurringExpenseJob();

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
