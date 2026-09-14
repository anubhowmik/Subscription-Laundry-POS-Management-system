// ZATCA's fixed VATEX-SA-* exemption reason codes (Phase 2 e-invoicing implementation
// guideline). Only relevant when an invoice's tax category is Exempt (E) or Zero-rated (Z) -
// applying one of these to a standard-rated (S) line would be non-compliant, but this system
// doesn't attempt that validation since it stores the reason at the whole-sale level (see
// pos.service.ts) rather than tracking a mixed-category cart.
export const TAX_EXEMPTION_REASONS: Record<string, { en: string; ar: string }> = {
  "VATEX-SA-29": {
    en: "Financial services mentioned in Article 29 of the VAT Regulations",
    ar: "الخدمات المالية المذكورة في المادة 29 من اللائحة التنفيذية لضريبة القيمة المضافة",
  },
  "VATEX-SA-29-7": {
    en: "Life insurance services mentioned in Article 29 of the VAT Regulations",
    ar: "خدمات التأمين على الحياة المذكورة في المادة 29 من اللائحة التنفيذية",
  },
  "VATEX-SA-30": {
    en: "Real estate transactions mentioned in Article 30 of the VAT Regulations",
    ar: "معاملات العقارات المذكورة في المادة 30 من اللائحة التنفيذية",
  },
  "VATEX-SA-32": { en: "Export of goods", ar: "تصدير السلع" },
  "VATEX-SA-33": { en: "Export of services", ar: "تصدير الخدمات" },
  "VATEX-SA-34-1": { en: "International transport of goods", ar: "النقل الدولي للسلع" },
  "VATEX-SA-34-2": { en: "International transport of passengers", ar: "النقل الدولي للركاب" },
  "VATEX-SA-34-3": {
    en: "Services directly connected with international transport of goods or passengers",
    ar: "الخدمات المرتبطة مباشرة بالنقل الدولي للسلع أو الركاب",
  },
  "VATEX-SA-34-4": { en: "Supply of a qualifying means of transport", ar: "توريد وسيلة نقل مؤهلة" },
  "VATEX-SA-34-5": {
    en: "Supply of goods and services relating to a qualifying means of transport",
    ar: "توريد السلع والخدمات المتعلقة بوسيلة نقل مؤهلة",
  },
  "VATEX-SA-35": { en: "Medicines and medical equipment", ar: "الأدوية والمعدات الطبية" },
};

export const TAX_EXEMPTION_REASON_CODES = Object.keys(TAX_EXEMPTION_REASONS) as [string, ...string[]];
