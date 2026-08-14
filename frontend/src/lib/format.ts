export function formatMoney(value: string | number, currency = "SAR", locale = "en-US"): string {
  const num = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "symbol" }).format(num);
}

export function formatDate(value: string | Date, locale = "en-US"): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date);
}
