// Default per-trigger SMS text seeded for every new org (and backfilled for existing ones).
// Placeholders are substituted by notifications.service.ts's sendTemplatedSms() - each trigger's
// caller documents which placeholders it actually supplies.

export interface NotificationTemplateDef {
  trigger: "ORDER_READY" | "ORDER_DELIVERED" | "NEW_SALE" | "PAYMENT_RECEIVED" | "PAYMENT_REMINDER" | "COMPENSATION_RESOLVED" | "NEW_QUOTATION";
  messageEn: string;
  messageAr: string;
}

export const NOTIFICATION_TEMPLATE_DEFS: NotificationTemplateDef[] = [
  {
    trigger: "ORDER_READY",
    messageEn: "Your order {invoiceNumber} is ready for pickup.",
    messageAr: "طلبك {invoiceNumber} جاهز للاستلام.",
  },
  {
    trigger: "ORDER_DELIVERED",
    messageEn: "Your order {invoiceNumber} has been delivered. Thank you!",
    messageAr: "تم تسليم طلبك {invoiceNumber}. شكرًا لك!",
  },
  {
    trigger: "NEW_SALE",
    messageEn: "Thank you {customerName}! Invoice {invoiceNumber} total: {amount}.",
    messageAr: "شكرًا لك {customerName}! فاتورة {invoiceNumber} بإجمالي: {amount}.",
  },
  {
    trigger: "PAYMENT_RECEIVED",
    messageEn: "Payment received for invoice {invoiceNumber}: {amount}. Thank you!",
    messageAr: "تم استلام الدفعة لفاتورة {invoiceNumber}: {amount}. شكرًا لك!",
  },
  {
    trigger: "PAYMENT_REMINDER",
    messageEn: "Reminder: invoice {invoiceNumber} has an outstanding balance of {dueAmount}. Please settle at your earliest convenience.",
    messageAr: "تذكير: فاتورة {invoiceNumber} بها رصيد مستحق قدره {dueAmount}. يرجى السداد في أقرب وقت.",
  },
  {
    trigger: "COMPENSATION_RESOLVED",
    messageEn: "Your compensation claim has been resolved. {amount} has been credited to your account.",
    messageAr: "تمت تسوية مطالبة التعويض الخاصة بك. تم إضافة {amount} إلى حسابك.",
  },
  // Reference's own default new_quotation template (NotificationTemplate::defaultNotificationTemplates(),
  // adapted field names: invoice_number/total_amount/quote_url -> quoteNumber/amount/quoteUrl to
  // match this app's own placeholder naming convention elsewhere in this file). Sent on-demand by
  // the "Send Notification" row action (pos.controller.ts's sendQuoteNotification), not
  // automatically like every other trigger here.
  {
    trigger: "NEW_QUOTATION",
    messageEn: "Dear {customerName}, your quotation number is {quoteNumber}. Total amount: {amount}. View it here: {quoteUrl}",
    messageAr: "عزيزي {customerName}، رقم عرض السعر الخاص بك هو {quoteNumber}. الإجمالي: {amount}. اطّلع عليه هنا: {quoteUrl}",
  },
];
