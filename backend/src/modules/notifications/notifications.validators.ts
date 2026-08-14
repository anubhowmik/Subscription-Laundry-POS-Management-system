import { z } from "zod";

export const updateNotificationSettingsSchema = z.object({
  appSid: z.string().min(1).optional(),
  senderId: z.string().min(1).optional(),
  enabled: z.boolean(),
});

export const updateNotificationTemplateSchema = z.object({
  messageEn: z.string().min(1),
  messageAr: z.string().min(1),
  isEnabled: z.boolean(),
});
