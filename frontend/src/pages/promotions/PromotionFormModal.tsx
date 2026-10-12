import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BadgePercent, CalendarClock, Filter, Gift, Info, Plus, Search, Tag, Wallet, X } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useCustomers } from "../../api/posApi";
import { useCurrentApp } from "../../components/layout/Sidebar";
import { cn } from "../../lib/cn";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { FormSection, RequiredMark } from "../../components/ui/FormSection";
import { MultiSelectDropdown, type MultiSelectOption } from "../../components/ui/MultiSelectDropdown";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { errorMessage } from "../paymentAccounts/shared";
import {
  PROMOTION_DAYS,
  PROMOTION_DAY_LABELS,
  PROMOTION_TYPES,
  PROMOTION_TYPE_LABELS,
  usePromotionFormOptions,
  type PromotionDetail,
  type PromotionType,
} from "../../api/promotionsApi";

interface Line {
  itemKey: string;
  quantity: string;
  giftItemKey: string;
  giftQuantity: string;
  discountPercent: string;
}
interface Form {
  name: string;
  type: PromotionType | "";
  checkCondition: "amount" | "quantity";
  salesQuantity: string;
  salesAmount: string;
  locationGroupIds: string[];
  businessLocationIds: string[];
  excludeBusinessLocationIds: string[];
  customerGroupIds: string[];
  priceListIds: string[];
  customerIds: string[];
  excludeCustomerIds: string[];
  categoryKeys: string[];
  excludeCategoryKeys: string[];
  brandIds: string[];
  itemKeys: string[];
  excludeItemKeys: string[];
  applyIfAllProductsExist: boolean;
  startsAt: string;
  endsAt: string;
  days: string[];
  periods: { from: string; to: string }[];
  discountType: "" | "FIXED" | "PERCENTAGE";
  discountAmount: string;
  daQuantity: string;
  bounceQuantity: string;
  giftQuantity: string;
  giftItemKeys: string[];
  lines: Line[];
  priority: string;
  isActive: boolean;
  autoApply: boolean;
  fullCash: boolean;
  expeditedDiscount: boolean;
  excludeCustomerGroup: boolean;
  cashBackValue: string;
  pointsForCashBack: string;
  cashBackExpirationDays: string;
  redeemAfterEnd: boolean;
}

const EMPTY_LINE: Line = { itemKey: "", quantity: "", giftItemKey: "", giftQuantity: "", discountPercent: "" };
// Reference create.blade.php defaults: Active, Auto apply, Apply Expedited Discount and Exclude
// Customer Group start ticked; one empty From/To period row.
const EMPTY: Form = {
  name: "",
  type: "",
  checkCondition: "amount",
  salesQuantity: "",
  salesAmount: "",
  locationGroupIds: [],
  businessLocationIds: [],
  excludeBusinessLocationIds: [],
  customerGroupIds: [],
  priceListIds: [],
  customerIds: [],
  excludeCustomerIds: [],
  categoryKeys: [],
  excludeCategoryKeys: [],
  brandIds: [],
  itemKeys: [],
  excludeItemKeys: [],
  applyIfAllProductsExist: false,
  startsAt: "",
  endsAt: "",
  days: [],
  periods: [{ from: "", to: "" }],
  discountType: "",
  discountAmount: "",
  daQuantity: "",
  bounceQuantity: "",
  giftQuantity: "",
  giftItemKeys: [],
  lines: [{ ...EMPTY_LINE }],
  priority: "",
  isActive: true,
  autoApply: true,
  fullCash: false,
  expeditedDiscount: true,
  excludeCustomerGroup: true,
  cashBackValue: "",
  pointsForCashBack: "",
  cashBackExpirationDays: "",
  redeemAfterEnd: false,
};

const str = (v: string | number | null | undefined) => (v == null ? "" : String(Number(v)));

function fromDetail(p: PromotionDetail): Form {
  return {
    name: p.name,
    type: p.type,
    checkCondition: p.type === "PRODUCT_GIFTS" && p.salesQuantity != null ? "quantity" : "amount",
    salesQuantity: str(p.salesQuantity),
    salesAmount: str(p.salesAmount),
    locationGroupIds: p.locationGroupIds,
    businessLocationIds: p.businessLocationIds,
    excludeBusinessLocationIds: p.excludeBusinessLocationIds,
    customerGroupIds: p.customerGroupIds,
    priceListIds: p.priceListIds,
    customerIds: p.customerIds,
    excludeCustomerIds: p.excludeCustomerIds,
    categoryKeys: p.categoryKeys,
    excludeCategoryKeys: p.excludeCategoryKeys,
    brandIds: p.brandIds,
    itemKeys: p.itemKeys,
    excludeItemKeys: p.excludeItemKeys,
    applyIfAllProductsExist: p.applyIfAllProductsExist,
    startsAt: p.startsAt?.slice(0, 10) ?? "",
    endsAt: p.endsAt?.slice(0, 10) ?? "",
    days: p.days,
    periods: p.periods?.length ? p.periods : [{ from: "", to: "" }],
    discountType: p.discountType ?? "",
    discountAmount: str(p.discountAmount),
    daQuantity: str(p.daQuantity),
    bounceQuantity: str(p.bounceQuantity),
    giftQuantity: str(p.giftQuantity),
    giftItemKeys: p.giftItemKeys,
    lines: p.lines.length
      ? p.lines.map((l) => ({ itemKey: l.itemKey, quantity: str(l.quantity), giftItemKey: l.giftItemKey, giftQuantity: str(l.giftQuantity), discountPercent: str(l.discountPercent) }))
      : [{ ...EMPTY_LINE }],
    priority: str(p.priority),
    isActive: p.isActive,
    autoApply: p.autoApply,
    fullCash: p.fullCash,
    expeditedDiscount: p.expeditedDiscount,
    excludeCustomerGroup: p.excludeCustomerGroup,
    cashBackValue: str(p.cashBackValue),
    pointsForCashBack: str(p.pointsForCashBack),
    cashBackExpirationDays: str(p.cashBackExpirationDays),
    redeemAfterEnd: p.redeemAfterEnd,
  };
}

/**
 * Reference promotions/create.blade.php + edit.blade.php, with app.js's `#p_type` handler deciding
 * which fields each type shows: Name, Type, the Conditions block, Activation Time, then the
 * Promotion block (discount / quantities / gifts / multi-product rules / cash back).
 */
export function PromotionFormModal({ id, isAr, onClose, onSaved }: { id: string | null; isAr: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { data: options } = usePromotionFormOptions();
  const { data: detail, isLoading } = useQuery({
    queryKey: ["promotions", "detail", id],
    queryFn: async () => (await api.get<ApiSuccess<PromotionDetail>>(`/promotions/${id}`)).data.data,
    enabled: Boolean(id),
  });
  useEffect(() => {
    if (detail) setForm(fromDetail(detail));
  }, [detail]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const type = form.type;
  const is = (...types: PromotionType[]) => type !== "" && types.includes(type);
  const giftByQty = type === "PRODUCT_GIFTS" && form.checkCondition === "quantity";
  const show = {
    checkCondition: is("PRODUCT_GIFTS"),
    salesQuantity: is("QUANTITY_DISCOUNT", "BOUNCE") || giftByQty,
    salesAmount: is("PRICE_DISCOUNT") || (type === "PRODUCT_GIFTS" && !giftByQty),
    itemConditions: !is("MULTIPLE_DISCOUNT"),
    allProducts: is("QUANTITY_DISCOUNT"),
    discount: is("TRADITIONAL_DISCOUNT", "QUANTITY_DISCOUNT", "PRICE_DISCOUNT"),
    daQuantity: is("QUANTITY_DISCOUNT"),
    bounce: is("BOUNCE"),
    gifts: is("PRODUCT_GIFTS"),
    lines: is("MULTIPLE_DISCOUNT"),
    cashBack: is("CASH_BACK"),
  };

  // Service POS and Product POS are separate apps - each only offers its own items/categories.
  const appKey = useCurrentApp()?.key;
  const appKind = appKey === "posService" ? "SERVICE" : appKey === "posProduct" ? "PRODUCT" : null;
  const inApp = (row: { kind: "PRODUCT" | "SERVICE" }) => !appKind || row.kind === appKind;
  const name = (x: { nameEn: string; nameAr: string | null }) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
  const opt = <T extends { nameEn: string; nameAr: string | null }>(rows: T[] | undefined, value: (r: T) => string, label?: (r: T) => string): MultiSelectOption[] =>
    (rows ?? []).map((r) => ({ value: value(r), label: label ? label(r) : name(r) }));
  const locationOptions = (options?.locations ?? []).map((l) => ({ value: l.id, label: `${isAr ? l.branchNameAr || l.branchName : l.branchName} (${l.branchCode})` }));
  const categoryOptions = opt(options?.categories.filter(inApp), (c) => c.key);
  const itemOptions = opt(options?.items.filter(inApp), (i) => i.key, (i) => `${name(i)}${i.code ? ` (${i.code})` : ""}`);
  const dayOptions = PROMOTION_DAYS.map((d) => ({ value: d, label: PROMOTION_DAY_LABELS[d][isAr ? "ar" : "en"] }));

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        type: form.type,
        checkCondition: form.checkCondition,
        salesQuantity: show.salesQuantity ? num(form.salesQuantity) : null,
        salesAmount: show.salesAmount ? num(form.salesAmount) : null,
        locationGroupIds: form.locationGroupIds,
        businessLocationIds: form.businessLocationIds,
        excludeBusinessLocationIds: form.excludeBusinessLocationIds,
        customerGroupIds: form.excludeCustomerGroup ? [] : form.customerGroupIds,
        priceListIds: form.priceListIds,
        customerIds: form.customerIds,
        excludeCustomerIds: form.excludeCustomerIds,
        categoryKeys: show.itemConditions ? form.categoryKeys : [],
        excludeCategoryKeys: show.itemConditions ? form.excludeCategoryKeys : [],
        brandIds: show.itemConditions ? form.brandIds : [],
        itemKeys: show.itemConditions ? form.itemKeys : [],
        excludeItemKeys: show.itemConditions ? form.excludeItemKeys : [],
        applyIfAllProductsExist: show.allProducts && form.applyIfAllProductsExist,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        days: form.days,
        periods: form.periods.filter((p) => p.from && p.to),
        discountType: show.discount ? form.discountType || null : null,
        discountAmount: show.discount ? num(form.discountAmount) : null,
        daQuantity: show.daQuantity ? num(form.daQuantity) : null,
        bounceQuantity: show.bounce ? num(form.bounceQuantity) : null,
        giftQuantity: show.gifts ? num(form.giftQuantity) : null,
        giftItemKeys: show.gifts ? form.giftItemKeys : [],
        lines: show.lines
          ? form.lines
              .filter((l) => l.itemKey || l.giftItemKey)
              .map((l) => ({
                itemKey: l.itemKey,
                quantity: Number(l.quantity),
                giftItemKey: l.giftItemKey,
                giftQuantity: Number(l.giftQuantity),
                discountPercent: Number(l.discountPercent),
              }))
          : [],
        priority: num(form.priority),
        isActive: form.isActive,
        autoApply: form.autoApply,
        fullCash: form.fullCash,
        expeditedDiscount: form.expeditedDiscount,
        excludeCustomerGroup: form.excludeCustomerGroup,
        cashBackValue: show.cashBack ? num(form.cashBackValue) : null,
        pointsForCashBack: show.cashBack ? num(form.pointsForCashBack) : null,
        cashBackExpirationDays: show.cashBack ? num(form.cashBackExpirationDays) : null,
        redeemAfterEnd: show.cashBack && form.redeemAfterEnd,
      };
      return id ? api.put(`/promotions/${id}`, body) : api.post("/promotions", body);
    },
    onSuccess: () => onSaved(id ? (isAr ? "تم التحديث بنجاح" : "Updated Successfully") : isAr ? "اضيف بنجاح" : "Added Successfully"),
    onError: (err: unknown) => {
      setError(errorMessage(err, isAr));
      const errors = (err as { response?: { data?: { errors?: { field: string; message: string }[] } } }).response?.data?.errors ?? [];
      setFieldErrors(Object.fromEntries(errors.map((e) => [e.field.split(".")[0], e.message])));
    },
  });

  const req = (field: keyof Form, label: string, input: ReactNode, hint?: ReactNode) => (
    <div>
      <label className={labelClass}>
        {label}
        <RequiredMark />
        {hint}
      </label>
      {input}
      {fieldErrors[field] && <p className="mt-1 text-xs text-red-600">{fieldErrors[field]}</p>}
    </div>
  );
  const field = (label: string, input: ReactNode, error?: string) => (
    <div>
      <label className={labelClass}>{label}</label>
      {input}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
  const numberInput = (key: keyof Form, placeholder: string, opts: { step?: string; min?: number } = {}) => (
    <input
      type="number"
      min={opts.min ?? 1}
      step={opts.step ?? "1"}
      value={form[key] as string}
      onChange={(e) => set(key, e.target.value as never)}
      placeholder={placeholder}
      className={cn(inputClass, "ltr-nums")}
    />
  );
  const multi = (key: keyof Form, values: MultiSelectOption[], placeholder: string, searchable = false) => (
    <MultiSelectDropdown options={values} value={form[key] as string[]} onChange={(v) => set(key, v as never)} placeholder={placeholder} isAr={isAr} searchable={searchable} />
  );
  const check = (key: keyof Form, label: string, disabled = false) => (
    <label className={cn("flex items-center gap-2 text-sm font-medium text-slate-700", disabled && "opacity-60")}>
      <input type="checkbox" checked={form[key] as boolean} disabled={disabled} onChange={(e) => set(key, e.target.checked as never)} />
      {label}
    </label>
  );
  const all = isAr ? "الكل" : "All";
  const pick = isAr ? "يرجى الاختيار" : "Please Select";

  const canSubmit = form.name.trim() && form.type && !save.isPending;
  return (
    <Modal
      title={id ? (isAr ? "تعديل العرض الترويجي" : "Edit Promotion") : isAr ? "إنشاء عرض ترويجي" : "Create Promotion"}
      onClose={onClose}
      size="2xl"
    >
      {id && isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">{isAr ? "جارٍ التحميل..." : "Loading..."}</p>
      ) : (
        <div className="space-y-4">
          <FormSection title={isAr ? "العرض الترويجي" : "Promotion"} icon={BadgePercent}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {req("name", isAr ? "الإسم" : "Name", <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={isAr ? "الإسم" : "Name"} autoFocus className={inputClass} />)}
              {req(
                "type",
                isAr ? "نوع" : "Type",
                <select value={form.type} onChange={(e) => set("type", e.target.value as PromotionType)} className={selectClass}>
                  <option value="">{pick}</option>
                  {PROMOTION_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {PROMOTION_TYPE_LABELS[v][isAr ? "ar" : "en"]}
                    </option>
                  ))}
                </select>,
              )}
              {show.checkCondition && (
                <div className="flex items-end gap-5 pb-2 sm:col-span-2">
                  {(
                    [
                      ["amount", isAr ? "صلاحية الحد الاقص لمبلغ طلبات البيع" : "Amount Role"],
                      ["quantity", isAr ? "صلاحية الكمية" : "Quantity Role"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input type="radio" name="checkCondition" checked={form.checkCondition === value} onChange={() => set("checkCondition", value)} />
                      {label}
                    </label>
                  ))}
                </div>
              )}
              {show.salesQuantity && req("salesQuantity", isAr ? "كمية المبيعات" : "Sales Quantity", numberInput("salesQuantity", isAr ? "كمية المبيعات" : "Sales Quantity"))}
              {show.salesAmount && req("salesAmount", isAr ? "مبلغ الفاتورة" : "Sales Amount", numberInput("salesAmount", isAr ? "مبلغ الفاتورة" : "Sales Amount", { step: "0.01" }))}
            </div>
          </FormSection>

          <FormSection title={isAr ? "الشروط" : "Conditions"} icon={Filter} collapsible defaultOpen={Boolean(id)}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field(isAr ? "مجموعات الفروع" : "Location Group", multi("locationGroupIds", opt(options?.locationGroups, (g) => g.id), all))}
              {field(isAr ? "فرع" : "Location", multi("businessLocationIds", locationOptions, all, true))}
              {field(isAr ? "استثناء فرع" : "Exclude Location", multi("excludeBusinessLocationIds", locationOptions, pick, true))}
              {field(
                isAr ? "مجموعة العملاء" : "Customer Group",
                form.excludeCustomerGroup ? (
                  <div className={cn(inputClass, "flex min-h-[42px] items-center bg-slate-50 text-slate-400")}>{isAr ? "معطل - استبعاد عملاء الشركات مفعل" : "Disabled while Exclude Customer Group is on"}</div>
                ) : (
                  multi("customerGroupIds", opt(options?.customerGroups, (g) => g.id), all)
                ),
              )}
              {field(isAr ? "مجموعة أسعار البيع" : "Selling Price Group", multi("priceListIds", opt(options?.priceLists, (g) => g.id), all))}
              <div />
              {field(
                isAr ? "العميل" : "Customer",
                <CustomerMultiPicker value={form.customerIds} onChange={(v) => set("customerIds", v)} known={detail?.customers ?? []} isAr={isAr} />,
              )}
              {field(
                isAr ? "استثناء عميل" : "Exclude Customer",
                <CustomerMultiPicker value={form.excludeCustomerIds} onChange={(v) => set("excludeCustomerIds", v)} known={detail?.customers ?? []} isAr={isAr} />,
              )}
              {show.itemConditions && (
                <>
                  {field(isAr ? "الصنف" : "Category", multi("categoryKeys", categoryOptions, all, true))}
                  {field(isAr ? "استثناء صنف" : "Exclude Category", multi("excludeCategoryKeys", categoryOptions, pick, true))}
                  {appKind !== "SERVICE" && field(isAr ? "العلامة التجارية" : "Brand", multi("brandIds", opt(options?.brands, (b) => b.id), all, true))}
                  <div>
                    {field(isAr ? "المنتجات" : "Products", multi("itemKeys", itemOptions, all, true))}
                    {show.allProducts && <div className="mt-2">{check("applyIfAllProductsExist", isAr ? "يشترط وجود كل المنتجات" : "All products required")}</div>}
                  </div>
                  {field(isAr ? "استثناء منتجات" : "Exclude Products", multi("excludeItemKeys", itemOptions, pick, true))}
                </>
              )}
            </div>
          </FormSection>

          <FormSection title={isAr ? "وقت التفعيل" : "Activation Time"} icon={CalendarClock} collapsible defaultOpen={Boolean(id)}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field(isAr ? "يبدأ في" : "Starts At", <input type="date" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={cn(inputClass, "ltr-nums")} />)}
              {field(
                isAr ? "ينتهي عند" : "Ends At",
                <input type="date" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={cn(inputClass, "ltr-nums")} />,
                fieldErrors.endsAt,
              )}
              <div className="sm:col-span-2">{field(isAr ? "الأيام" : "Days", multi("days", dayOptions, all))}</div>
              {form.periods.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 sm:col-span-2">
                  {field(
                    isAr ? "من الساعة" : "From Time",
                    <input type="time" value={p.from} onChange={(e) => set("periods", form.periods.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} className={cn(inputClass, "ltr-nums")} />,
                  )}
                  {field(
                    isAr ? "الي الساعة" : "To Time",
                    <input type="time" value={p.to} onChange={(e) => set("periods", form.periods.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} className={cn(inputClass, "ltr-nums")} />,
                  )}
                  <button
                    type="button"
                    onClick={() => set("periods", form.periods.length > 1 ? form.periods.filter((_, j) => j !== i) : [{ from: "", to: "" }])}
                    className="mb-2 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={isAr ? "إزالة" : "Remove"}
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
              <div className="sm:col-span-2">
                <Button size="sm" variant="outline" onClick={() => set("periods", [...form.periods, { from: "", to: "" }])}>
                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "إضافة" : "Add"}
                </Button>
              </div>
            </div>
          </FormSection>

          {type !== "" && (
            <FormSection title={isAr ? "العرض الترويجي" : "Promotion"} icon={show.cashBack ? Wallet : show.gifts || show.bounce ? Gift : Tag}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {show.cashBack && (
                  <>
                    {req("cashBackValue", isAr ? "قيمة استرداد النقود" : "Cash back value", numberInput("cashBackValue", isAr ? "قيمة استرداد النقود" : "Cash back value", { step: "0.01", min: 0.01 }))}
                    {req("pointsForCashBack", isAr ? "نقاط للاسترداد النقدي" : "Points for cash back", numberInput("pointsForCashBack", isAr ? "نقاط للاسترداد النقدي" : "Points for cash back", { step: "0.01" }))}
                    {req("cashBackExpirationDays", isAr ? "عدد أيام صلاحية" : "Expiration days", numberInput("cashBackExpirationDays", isAr ? "عدد أيام صلاحية" : "Expiration days"))}
                    <div className="flex items-end pb-2">{check("redeemAfterEnd", isAr ? "السماح بالاسترداد بعد نهاية العرض" : "Redeem After Offer Expiry")}</div>
                    <p className="flex items-start gap-1.5 text-xs text-slate-500 sm:col-span-2">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                      {isAr
                        ? "الاسترداد النقدي = إجمالي الفاتورة × قيمة استرداد النقود ÷ نقاط للاسترداد النقدي."
                        : "Cash back earned = invoice total x cash back value / points for cash back."}
                    </p>
                  </>
                )}

                {show.lines && (
                  <div className="space-y-2 sm:col-span-2">
                    {form.lines.map((l, i) => {
                      const setLine = (patch: Partial<Line>) => set("lines", form.lines.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                      return (
                        <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-100 p-2 sm:grid-cols-[2fr_1fr_2fr_1fr_1fr_auto]">
                          {field(
                            `${isAr ? "منتج" : "Product"} *`,
                            <select value={l.itemKey} onChange={(e) => setLine({ itemKey: e.target.value })} className={selectClass}>
                              <option value="">{pick}</option>
                              {itemOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>,
                          )}
                          {field(
                            `${isAr ? "الكمية" : "Quantity"} *`,
                            <input type="number" min={1} value={l.quantity} onChange={(e) => setLine({ quantity: e.target.value })} placeholder={isAr ? "الكمية" : "Quantity"} className={cn(inputClass, "ltr-nums")} />,
                          )}
                          {field(
                            `${isAr ? "المنتج المطبق عليه الخصم" : "Discount Product"} *`,
                            <select value={l.giftItemKey} onChange={(e) => setLine({ giftItemKey: e.target.value })} className={selectClass}>
                              <option value="">{pick}</option>
                              {itemOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>,
                          )}
                          {field(
                            `${isAr ? "الكمية المنفذ عليها الخصم" : "Discount Quantity"} *`,
                            <input type="number" min={1} value={l.giftQuantity} onChange={(e) => setLine({ giftQuantity: e.target.value })} placeholder={isAr ? "الكمية" : "Quantity"} className={cn(inputClass, "ltr-nums")} />,
                          )}
                          {field(
                            `${isAr ? "الخصم" : "Discount"} % *`,
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={l.discountPercent}
                              onChange={(e) => setLine({ discountPercent: e.target.value })}
                              placeholder={isAr ? "مبلغ الخصم" : "Discount Amount"}
                              className={cn(inputClass, "ltr-nums")}
                            />,
                          )}
                          <button
                            type="button"
                            onClick={() => set("lines", form.lines.length > 1 ? form.lines.filter((_, j) => j !== i) : [{ ...EMPTY_LINE }])}
                            className="mb-2 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={isAr ? "إزالة" : "Remove"}
                          >
                            <X className="h-4 w-4" strokeWidth={2} />
                          </button>
                        </div>
                      );
                    })}
                    {fieldErrors.lines && <p className="text-xs text-red-600">{fieldErrors.lines}</p>}
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => set("lines", [...form.lines, { ...EMPTY_LINE }])}>
                        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "أضف منتجًا" : "Add Product"}
                      </Button>
                    </div>
                  </div>
                )}

                {show.discount && (
                  <>
                    {req(
                      "discountType",
                      isAr ? "نوع الخصم" : "Discount Type",
                      <select value={form.discountType} onChange={(e) => set("discountType", e.target.value as Form["discountType"])} className={selectClass}>
                        <option value="">{pick}</option>
                        <option value="FIXED">{isAr ? "ثابت" : "Fixed"}</option>
                        <option value="PERCENTAGE">{isAr ? "النسبة المئوية" : "Percentage"}</option>
                      </select>,
                    )}
                    {req("discountAmount", isAr ? "مبلغ الخصم" : "Discount Amount", numberInput("discountAmount", isAr ? "مبلغ الخصم" : "Discount Amount", { step: "0.01", min: 0.01 }))}
                  </>
                )}
                {show.bounce && req("bounceQuantity", isAr ? "كمية البونص" : "Bonus Quantity", numberInput("bounceQuantity", isAr ? "كمية البونص" : "Bonus Quantity"))}
                {show.daQuantity && req("daQuantity", isAr ? "خصم الكمية" : "Discount Quantity", numberInput("daQuantity", isAr ? "خصم الكمية" : "Discount Quantity"))}
                {show.gifts && (
                  <>
                    {req("giftQuantity", isAr ? "الكمية للهدية" : "Gift Quantity", numberInput("giftQuantity", isAr ? "الكمية للهدية" : "Gift Quantity"))}
                    {req("giftItemKeys", isAr ? "هدايا المنتجات" : "Gift Products", multi("giftItemKeys", itemOptions, pick, true))}
                  </>
                )}

                {field(
                  isAr ? "أفضلية" : "Priority",
                  <input
                    type="number"
                    step="1"
                    value={form.priority}
                    onChange={(e) => set("priority", e.target.value)}
                    placeholder={isAr ? "أفضلية" : "Priority"}
                    title={isAr ? "الخصم ذو الأولوية الأعلى سيكون له وزن أعلى" : "Discount with higher priority will have higher weightage"}
                    className={cn(inputClass, "ltr-nums")}
                  />,
                )}
                <div className="flex flex-wrap items-end gap-x-5 gap-y-2 pb-2">
                  {check("isActive", isAr ? "مفعل" : "Active")}
                  {check("autoApply", isAr ? "تطبيق تلقائي" : "Auto apply")}
                  {!show.cashBack && check("fullCash", isAr ? "عند دفع المبلغ نقدي بالكامل" : "Full Cash")}
                </div>
                {!show.cashBack && <div className="pb-1">{check("expeditedDiscount", isAr ? "تطبيق خصم السداد المعجل" : "Apply Expedited Discount")}</div>}
                <div className="pb-1">{check("excludeCustomerGroup", isAr ? "استبعاد عملاء الشركات" : "Exclude Customer Group")}</div>
              </div>
            </FormSection>
          )}

          {error && <Alert variant="danger">{error}</Alert>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" fullWidth onClick={onClose}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
            <Button type="button" fullWidth disabled={!canSubmit} onClick={() => save.mutate()}>
              {save.isPending ? "…" : t("common.save")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Reference `search_customers` select2 - searched by name / mobile, picked into chips. */
export function CustomerMultiPicker({
  value,
  onChange,
  known,
  isAr,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  known: { id: string; code: string; nameEn: string; nameAr: string | null }[];
  isAr: boolean;
}) {
  const [search, setSearch] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const { data: results } = useCustomers(search.trim());
  const label = (c: { code: string; nameEn: string; nameAr: string | null }) => `${isAr ? c.nameAr || c.nameEn : c.nameEn} (${c.code})`;
  const nameOf = useMemo(() => {
    const map: Record<string, string> = { ...names };
    for (const c of known) map[c.id] = label(c);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, names, isAr]);
  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700 ring-1 ring-inset ring-sky-200">
              {nameOf[id] ?? id.slice(0, 8)}
              <X className="h-3 w-3 cursor-pointer hover:text-red-600" strokeWidth={2.5} onClick={() => onChange(value.filter((x) => x !== id))} aria-label={isAr ? "إزالة" : "Remove"} />
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isAr ? "ابحث بالاسم أو الجوال" : "Search name or mobile"} className={cn(inputClass, "ps-9")} />
      </div>
      {search.trim() && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1">
          {(results ?? []).length === 0 && <p className="px-3 py-2 text-xs text-slate-400">{isAr ? "لا توجد نتائج" : "No results"}</p>}
          {(results ?? []).map((c) => {
            const on = value.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setNames((n) => ({ ...n, [c.id]: label(c) }));
                  onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id]);
                }}
                className={cn("flex w-full items-center justify-between px-3 py-1.5 text-start text-sm hover:bg-slate-50", on && "bg-sky-50")}
              >
                <span>{label(c)}</span>
                <span className="ltr-nums text-xs text-slate-400">{c.phone}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
