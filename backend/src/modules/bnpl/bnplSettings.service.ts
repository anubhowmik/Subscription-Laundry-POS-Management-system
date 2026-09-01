import type { BnplProvider } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { encryptSecret } from "../../utils/secretBox";

/** Never returns the plaintext token - only whether one is saved. Same discipline as
 * notifications.service.ts's hasAppSid / ZatcaDeviceCertificate's encrypted fields. */
export async function listSettings(organizationId: string) {
  const rows = await prisma.bnplProviderSettings.findMany({ where: { organizationId } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  const providers: BnplProvider[] = ["TAMARA", "TABBY", "MISPAY"];
  return providers.map((provider) => {
    const row = byProvider.get(provider);
    return {
      provider,
      isEnabled: row?.isEnabled ?? false,
      apiBaseUrlOverride: row?.apiBaseUrlOverride ?? null,
      hasMerchantToken: Boolean(row?.merchantTokenEncrypted),
    };
  });
}

interface UpdateProviderSettingsInput {
  isEnabled: boolean;
  merchantToken?: string;
  apiBaseUrlOverride?: string;
}

export async function updateProviderSettings(
  provider: BnplProvider,
  input: UpdateProviderSettingsInput,
  organizationId: string,
) {
  const existing = await prisma.bnplProviderSettings.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });

  const merchantTokenEncrypted = input.merchantToken ? encryptSecret(input.merchantToken) : existing?.merchantTokenEncrypted;

  const saved = await prisma.bnplProviderSettings.upsert({
    where: { organizationId_provider: { organizationId, provider } },
    update: { isEnabled: input.isEnabled, merchantTokenEncrypted, apiBaseUrlOverride: input.apiBaseUrlOverride ?? existing?.apiBaseUrlOverride },
    create: {
      organizationId,
      provider,
      isEnabled: input.isEnabled,
      merchantTokenEncrypted,
      apiBaseUrlOverride: input.apiBaseUrlOverride,
    },
  });

  return {
    provider: saved.provider,
    isEnabled: saved.isEnabled,
    apiBaseUrlOverride: saved.apiBaseUrlOverride,
    hasMerchantToken: Boolean(saved.merchantTokenEncrypted),
  };
}

/** Used by bnpl.service.ts before creating a session - throws nothing, just reports enablement. */
export async function isProviderEnabled(provider: BnplProvider, organizationId: string): Promise<boolean> {
  const row = await prisma.bnplProviderSettings.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
  return row?.isEnabled ?? false;
}
