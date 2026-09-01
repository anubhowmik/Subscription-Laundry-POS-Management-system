import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { useBnplSettings, useUpdateBnplProviderSettings, type BnplProvider, type BnplProviderSettingsRow } from "../../api/bnplApi";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import { labelClass, inputClass } from "../../components/ui/formClasses";
import { useAuth } from "../../contexts/AuthContext";

const PROVIDER_LABEL: Record<BnplProvider, { en: string; ar: string }> = {
  TAMARA: { en: "Tamara", ar: "تمارا" },
  TABBY: { en: "Tabby", ar: "تابي" },
  MISPAY: { en: "MISPay", ar: "ميسباي" },
};

export default function BnplSettingsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { data: settings } = useBnplSettings();

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={isAr ? "مزوّدو الدفع الآجل (BNPL)" : "BNPL Providers"} />
      <Alert variant="warning">
        {isAr
          ? "وضع تجريبي فقط — لا يوجد حساب تاجر حقيقي مع تمارا أو تابي أو ميسباي بعد. تفعيل مزوّد هنا يتيح للكاشير تجربة تدفق الدفع الآجل الكامل بموافقات محاكاة، دون ربط فعلي بأي مزوّد. بيانات الاعتماد أدناه تُحفظ بأمان لوقت إضافة تكامل حقيقي لاحقًا، لكنها غير مستخدمة الآن."
          : "Sandbox mode only — there is no real Tamara, Tabby, or MISPay merchant account yet. Enabling a provider here lets staff test the full BNPL checkout flow with simulated approvals, with no real connection to any provider. Credentials saved below are stored securely for when a live integration is added later, but are not used yet."}
      </Alert>

      <div className="space-y-4">
        {settings?.map((row) => <ProviderCard key={row.provider} isAr={isAr} row={row} />)}
      </div>
    </div>
  );
}

function ProviderCard({ isAr, row }: { isAr: boolean; row: BnplProviderSettingsRow }) {
  const { can } = useAuth();
  const canManage = can("bnpl.manage");
  const [isEnabled, setIsEnabled] = useState(row.isEnabled);
  const [merchantToken, setMerchantToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateBnplProviderSettings();

  useEffect(() => setIsEnabled(row.isEnabled), [row.isEnabled]);

  function save() {
    setError(null);
    update.mutate(
      { provider: row.provider, isEnabled, merchantToken: merchantToken || undefined },
      {
        onSuccess: () => setMerchantToken(""),
        onError: (err) =>
          setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
      },
    );
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{isAr ? PROVIDER_LABEL[row.provider].ar : PROVIDER_LABEL[row.provider].en}</h3>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isEnabled} disabled={!canManage} onChange={(e) => setIsEnabled(e.target.checked)} />
          {isAr ? "مفعّل (تجريبي)" : "Enabled (sandbox)"}
        </label>
      </div>
      <div>
        <label className={labelClass}>
          {isAr ? "رمز التاجر" : "Merchant Token"} {row.hasMerchantToken && <span className="text-emerald-600">({isAr ? "محفوظ" : "saved"})</span>}
        </label>
        <input
          type="password"
          value={merchantToken}
          disabled={!canManage}
          onChange={(e) => setMerchantToken(e.target.value)}
          placeholder={row.hasMerchantToken ? (isAr ? "اتركه فارغًا للإبقاء على القيمة الحالية" : "Leave blank to keep current value") : isAr ? "لم يُضف بعد" : "Not set yet"}
          className={inputClass}
        />
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {canManage && (
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </Button>
      )}
    </Card>
  );
}
