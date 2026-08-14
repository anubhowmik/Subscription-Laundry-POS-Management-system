import cron from "node-cron";
import { prisma } from "../config/prisma";
import { claimBusinessLocationNumber } from "../utils/documentNumbering";
import { logger } from "../config/logger";

/**
 * Each recurring Expense row is its own template: when its nextRecurrenceAt arrives, this clones
 * a concrete, one-off, unpaid instance (isRecurring: false - it's a real bill to pay, not itself
 * a schedule) and advances the template's own nextRecurrenceAt by recurringIntervalDays. The
 * template keeps firing indefinitely; only the instances it produces get paid against.
 */
export async function runRecurringExpenses() {
  const due = await prisma.expense.findMany({
    where: { isRecurring: true, nextRecurrenceAt: { lte: new Date() } },
  });

  for (const expense of due) {
    if (!expense.recurringIntervalDays) continue;

    await prisma.$transaction(async (tx) => {
      const expenseNumber = await claimBusinessLocationNumber(tx, expense.businessLocationId, "expense");
      await tx.expense.create({
        data: {
          organizationId: expense.organizationId,
          expenseNumber,
          categoryId: expense.categoryId,
          businessLocationId: expense.businessLocationId,
          supplierId: expense.supplierId,
          subtotal: expense.subtotal,
          taxPercent: expense.taxPercent,
          taxAmount: expense.taxAmount,
          totalAmount: expense.totalAmount,
          paidAmount: 0,
          dueAmount: expense.totalAmount,
          paymentStatus: "DUE",
          isRecurring: false,
          notes: expense.notes,
          createdBy: expense.createdBy,
        },
      });
      await tx.expense.update({
        where: { id: expense.id },
        data: { nextRecurrenceAt: new Date(Date.now() + expense.recurringIntervalDays! * 24 * 60 * 60 * 1000) },
      });
    });
  }
}

export function startRecurringExpenseJob() {
  cron.schedule("0 1 * * *", () => {
    runRecurringExpenses().catch((err) => logger.error({ err }, "Recurring expense job failed"));
  });
}
