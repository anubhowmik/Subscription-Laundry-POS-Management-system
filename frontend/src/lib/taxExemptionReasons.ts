// Mirrors backend/src/modules/zatca/taxExemptionReasons.ts - ZATCA's fixed VATEX-SA-* codes,
// only meaningful for a sale whose effective tax rate is 0 (all lines Exempt/Zero-rated).
export const TAX_EXEMPTION_REASONS: Record<string, { en: string; ar: string }> = {
  "VATEX-SA-29": {
    en: "Financial services (Article 29)",
    ar: "الخدمات المالية (المادة 29)",
  },
  "VATEX-SA-29-7": {
    en: "Life insurance services (Article 29)",
    ar: "خدمات التأمين على الحياة (المادة 29)",
  },
  "VATEX-SA-30": {
    en: "Real estate transactions (Article 30)",
    ar: "معاملات العقارات (المادة 30)",
  },
  "VATEX-SA-32": { en: "Export of goods", ar: "تصدير السلع" },
  "VATEX-SA-33": { en: "Export of services", ar: "تصدير الخدمات" },
  "VATEX-SA-34-1": { en: "International transport of goods", ar: "النقل الدولي للسلع" },
  "VATEX-SA-34-2": { en: "International transport of passengers", ar: "النقل الدولي للركاب" },
  "VATEX-SA-34-3": {
    en: "Services connected with international transport",
    ar: "الخدمات المرتبطة بالنقل الدولي",
  },
  "VATEX-SA-34-4": { en: "Supply of a qualifying means of transport", ar: "توريد وسيلة نقل مؤهلة" },
  "VATEX-SA-34-5": {
    en: "Goods/services relating to a qualifying transport",
    ar: "سلع/خدمات متعلقة بوسيلة نقل مؤهلة",
  },
  "VATEX-SA-35": { en: "Medicines and medical equipment", ar: "الأدوية والمعدات الطبية" },
};

export const TAX_EXEMPTION_REASON_CODES = Object.keys(TAX_EXEMPTION_REASONS);
