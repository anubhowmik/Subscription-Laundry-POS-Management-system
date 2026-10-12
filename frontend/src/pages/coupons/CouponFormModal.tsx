import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarClock, Filter, Info, Plus, Tag, Ticket, X } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useCurrentApp } from "../../components/layout/Sidebar";
import { cn } from "../../lib/cn";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { FormSection, RequiredMark } from "../../components/ui/FormSection";
import { MultiSelectDropdown, type MultiSelectOption } from "../../components/ui/MultiSelectDropdown";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { errorMessage } from "../paymentAccounts/shared";
import { PROMOTION_DAY_LABELS } from "../../api/promotionsApi";
import { COUPON_DAYS, useCouponFormOptions, type CouponDetail } from "../../api/couponsApi";
import { CustomerMultiPicker } from "../promotions/PromotionFormModal";

interface Form {
  name: string;
  code: string;
  minPurchaseAmount: string;
  maxUsesPerCustomer: string;
  maxUses: string;
  locationGroupIds: string[];
  businessLocationIds: string[];
  customerGroupIds: string[];
  customerIds: string[];
  excludeCustomerIds: string[];
  categoryKeys: string[];
  brandIds: string[];
  itemKeys: string[];
  validFrom: string;
  validUntil: string;
  days: string[];
  periods: { from: string; to: string }[];
  discountMode: "" | "FIXED" | "PERCENT";
  discountValue: string;
  maxDiscountAmount: string;
  isActive: boolean;
  addedDiscount: boolean;
  otp: boolean;
  // Add Bulk only (reference create_bulk.blade.php)
  prefix: string;
  digits: string;
  digitsType: "MIXED" | "NUMBERS" | "LETTERS";
  count: string;
}

// Reference create.blade.php defaults: Active and Added Discount ticked, OTP off, one empty period row.
const EMPTY: Form = {
  name: "",
  code: "",
  minPurchaseAmount: "",
  maxUsesPerCustomer: "",
  maxUses: "",
  locationGroupIds: [],
  businessLocationIds: [],
  customerGroupIds: [],
  customerIds: [],
  excludeCustomerIds: [],
  categoryKeys: [],
  brandIds: [],
  itemKeys: [],
  validFrom: "",
  validUntil: "",
  days: [],
  periods: [{ from: "", to: "" }],
  discountMode: "",
  discountValue: "",
  maxDiscountAmount: "",
  isActive: true,
  addedDiscount: true,
  otp: false,
  prefix: "",
  digits: "5",
  digitsType: "MIXED",
  count: "",
};

const str = (v: string | number | null | undefined) => (v == null ? "" : String(Number(v)));

function fromDetail(c: CouponDetail): Form {
  return {
    ...EMPTY,
    name: c.name,
    code: c.code,
    minPurchaseAmount: Number(c.minPurchaseAmount) ? str(c.minPurchaseAmount) : "",
    maxUsesPerCustomer: str(c.maxUsesPerCustomer),
    maxUses: str(c.maxUses),
    locationGroupIds: c.locationGroupIds,
    businessLocationIds: c.businessLocationIds,
    customerGroupIds: c.customerGroupIds,
    customerIds: c.customerIds,
    excludeCustomerIds: c.excludeCustomerIds,
    categoryKeys: c.categoryKeys,
    brandIds: c.brandIds,
    itemKeys: c.itemKeys,
    validFrom: c.validFrom?.slice(0, 10) ?? "",
    validUntil: c.validUntil?.slice(0, 10) ?? "",
    days: c.days,
    periods: c.periods?.length ? c.periods : [{ from: "", to: "" }],
    discountMode: c.discountMode,
    discountValue: str(c.discountValue),
    maxDiscountAmount: str(c.maxDiscountAmount),
    isActive: c.isActive,
    addedDiscount: c.addedDiscount,
    otp: c.otp,
  };
}

/**
 * Reference coupon/create.blade.php, edit.blade.php and (bulk) create_bulk.blade.php: Name, Coupon
 * (or the bulk code generator), Sales Amount, the two usage limits, the Conditions block, Activation
 * Time, then the Coupon Discount block with Active / Apply on added discounts / Send OTP.
 */
export function CouponFormModal({
  id,
  bulk = false,
  isAr,
  onClose,
  onSaved,
}: {
  id: string | null;
  bulk?: boolean;
  isAr: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { data: options } = useCouponFormOptions();
  const { data: detail, isLoading } = useQuery({
    queryKey: ["coupons", "detail", id],
    queryFn: async () => (await api.get<ApiSuccess<CouponDetail>>(`/coupons/${id}`)).data.data,
    enabled: Boolean(id),
  });
  useEffect(() => {
    if (detail) setForm(fromDetail(detail));
  }, [detail]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
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
  const dayOptions = COUPON_DAYS.map((d) => ({ value: d, label: PROMOTION_DAY_LABELS[d][isAr ? "ar" : "en"] }));

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        minPurchaseAmount: num(form.minPurchaseAmount) ?? 0,
        maxUsesPerCustomer: num(form.maxUsesPerCustomer),
        maxUses: num(form.maxUses),
        locationGroupIds: form.locationGroupIds,
        businessLocationIds: form.businessLocationIds,
        customerGroupIds: form.customerGroupIds,
        customerIds: form.customerIds,
        excludeCustomerIds: form.excludeCustomerIds,
        categoryKeys: form.categoryKeys,
        brandIds: form.brandIds,
        itemKeys: form.itemKeys,
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null,
        days: form.days,
        periods: form.periods.filter((p) => p.from && p.to),
        discountMode: form.discountMode,
        discountValue: num(form.discountValue),
        maxDiscountAmount: form.discountMode === "PERCENT" ? num(form.maxDiscountAmount) : null,
        isActive: form.isActive,
        addedDiscount: form.addedDiscount,
        otp: form.otp,
      };
      if (bulk) {
        const res = await api.post<ApiSuccess<{ created: number }>>("/coupons/bulk", {
          ...body,
          prefix: form.prefix,
          digits: num(form.digits) ?? 5,
          digitsType: form.digitsType,
          count: num(form.count),
        });
        return res.data.data.created;
      }
      return id ? api.put(`/coupons/${id}`, { ...body, code: form.code }) : api.post("/coupons", { ...body, code: form.code });
    },
    onSuccess: (created) =>
      onSaved(
        bulk
          ? isAr
            ? `تمت إضافة ${created} قسيمة`
            : `${created} coupons added`
          : id
            ? isAr
              ? "تم التحديث بنجاح"
              : "Updated Successfully"
            : isAr
              ? "اضيف بنجاح"
              : "Added Successfully",
      ),
    onError: (err: unknown) => {
      const message = errorMessage(err, isAr);
      setError(message === "Coupon already Exist!" && isAr ? "القسيمة موجودة بالفعل!" : message);
      const errors = (err as { response?: { data?: { errors?: { field: string; message: string }[] } } }).response?.data?.errors ?? [];
      setFieldErrors(Object.fromEntries(errors.map((e) => [e.field.split(".")[0], e.message])));
    },
  });

  const req = (key: string, label: string, input: ReactNode, hint?: string) => (
    <div>
      <label className={cn(labelClass, "flex items-center gap-1")}>
        {label}
        <RequiredMark />
        {hint && <HintIcon text={hint} />}
      </label>
      {input}
      {fieldErrors[key] && <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p>}
    </div>
  );
  const field = (key: string, label: string, input: ReactNode, hint?: string) => (
    <div>
      <label className={cn(labelClass, "flex items-center gap-1")}>
        {label}
        {hint && <HintIcon text={hint} />}
      </label>
      {input}
      {fieldErrors[key] && <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p>}
    </div>
  );
  const numberInput = (key: keyof Form, placeholder: string, opts: { step?: string; min?: number } = {}) => (
    <input
      type="number"
      min={opts.min ?? 0}
      step={opts.step ?? "1"}
      value={form[key] as string}
      onChange={(e) => set(key, e.target.value as never)}
      placeholder={placeholder}
      className={cn(inputClass, "ltr-nums")}
    />
  );
  const multi = (key: keyof Form, values: MultiSelectOption[], searchable = false) => (
    <MultiSelectDropdown options={values} value={form[key] as string[]} onChange={(v) => set(key, v as never)} placeholder={isAr ? "الكل" : "All"} isAr={isAr} searchable={searchable} />
  );
  const check = (key: keyof Form, label: string) => (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <input type="checkbox" checked={form[key] as boolean} onChange={(e) => set(key, e.target.checked as never)} />
      {label}
    </label>
  );

  const canSubmit = form.name.trim() && (bulk ? form.count : form.code.trim()) && form.discountMode && form.discountValue && !save.isPending;
  const title = bulk ? (isAr ? "إنشاء قسائم مجمعة" : "Create Bulk Coupons") : id ? (isAr ? "تعديل قسيمة الخصم" : "Edit Coupon") : isAr ? "إنشاء قسيمة خصم" : "Create Coupon";
  return (
    <Modal title={title} onClose={onClose} size="2xl">
      {id && isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">{isAr ? "جارٍ التحميل..." : "Loading..."}</p>
      ) : (
        <div className="space-y-4">
          <FormSection title={isAr ? "قسيمة خصم" : "Coupon"} icon={Ticket}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {req("name", isAr ? "الإسم" : "Name", <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={isAr ? "الإسم" : "Name"} autoFocus className={inputClass} />)}
              {!bulk &&
                req(
                  "code",
                  isAr ? "قسيمة خصم" : "Coupon",
                  <input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder={isAr ? "قسيمة خصم" : "Coupon"} className={cn(inputClass, "font-mono uppercase")} />,
                )}
              {bulk && (
                <>
                  {req("count", isAr ? "عدد القسائم" : "Number of Coupons", numberInput("count", isAr ? "عدد القسائم" : "Number of Coupons", { min: 1 }))}
                  {field("prefix", isAr ? "البادئة" : "Prefix", <input value={form.prefix} onChange={(e) => set("prefix", e.target.value.toUpperCase())} placeholder={isAr ? "البادئة" : "Prefix"} className={cn(inputClass, "font-mono uppercase")} />)}
                  {field("digits", isAr ? "عدد الارقام" : "Number of Digits", numberInput("digits", isAr ? "عدد الارقام" : "Number of Digits", { min: 4 }))}
                  {field(
                    "digitsType",
                    isAr ? "نوع الأرقام" : "Digits Type",
                    <select value={form.digitsType} onChange={(e) => set("digitsType", e.target.value as Form["digitsType"])} className={selectClass}>
                      <option value="MIXED">{isAr ? "كلاهما" : "Both"}</option>
                      <option value="NUMBERS">{isAr ? "أرقام فقط" : "Numbers Only"}</option>
                      <option value="LETTERS">{isAr ? "حروف فقط" : "Characters Only"}</option>
                    </select>,
                  )}
                </>
              )}
              {field("minPurchaseAmount", isAr ? "مبلغ الفاتورة" : "Sales Amount", numberInput("minPurchaseAmount", isAr ? "مبلغ الفاتورة" : "Sales Amount", { step: "0.01" }))}
              {field(
                "maxUsesPerCustomer",
                isAr ? "حد الاستخدام/بالعميل" : "Usage Limit per Customer",
                numberInput("maxUsesPerCustomer", isAr ? "حد الاستخدام/بالعميل" : "Usage Limit per Customer", { min: 1 }),
                isAr
                  ? "الحد الأقصى لاستخدام القسيمة لكل عميل. مثلاً إذا كانت القيمة 2 يمكن للعميل استخدامها مرتين في فاتورتين مختلفتين."
                  : "The maximum usage of the coupon per customer. For example, 2 means the customer can use it twice, on two different invoices.",
              )}
              {field(
                "maxUses",
                isAr ? "الحد الاقصي لاستخدام قسيمة الشراء" : "Usage Limit per Coupon",
                numberInput("maxUses", isAr ? "الحد الاقصي لاستخدام قسيمة الشراء" : "Usage Limit per Coupon", { min: 1 }),
                isAr
                  ? "الحد الأقصى لاستخدام القسيمة. مثلاً إذا كانت القيمة 10 فلن تكون صالحة بعد استخدامها 10 مرات على عملاء وفواتير مختلفة."
                  : "The maximum usage of the coupon. For example, 10 means it stops working after it was used 10 times, across customers and invoices.",
              )}
            </div>
          </FormSection>

          <FormSection title={isAr ? "الشروط" : "Conditions"} icon={Filter} collapsible defaultOpen={Boolean(id)}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field("locationGroupIds", isAr ? "مجموعات الفروع" : "Location Group", multi("locationGroupIds", opt(options?.locationGroups, (g) => g.id)))}
              {field("businessLocationIds", isAr ? "فرع" : "Location", multi("businessLocationIds", locationOptions, true))}
              {field("customerGroupIds", isAr ? "مجموعة العملاء" : "Customer Group", multi("customerGroupIds", opt(options?.customerGroups, (g) => g.id)))}
              <div />
              {field("customerIds", isAr ? "العميل" : "Customer", <CustomerMultiPicker value={form.customerIds} onChange={(v) => set("customerIds", v)} known={detail?.customers ?? []} isAr={isAr} />)}
              {field(
                "excludeCustomerIds",
                isAr ? "استثناء عميل" : "Exclude Customer",
                <CustomerMultiPicker value={form.excludeCustomerIds} onChange={(v) => set("excludeCustomerIds", v)} known={detail?.customers ?? []} isAr={isAr} />,
              )}
              {field("categoryKeys", isAr ? "الصنف" : "Category", multi("categoryKeys", categoryOptions, true))}
              {appKind !== "SERVICE" && field("brandIds", isAr ? "العلامة التجارية" : "Brand", multi("brandIds", opt(options?.brands, (b) => b.id), true))}
              <div className="sm:col-span-2">{field("itemKeys", isAr ? "المنتجات" : "Products", multi("itemKeys", itemOptions, true))}</div>
            </div>
          </FormSection>

          <FormSection title={isAr ? "وقت التفعيل" : "Activation Time"} icon={CalendarClock} collapsible defaultOpen={Boolean(id)}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field("validFrom", isAr ? "يبدأ في" : "Starts At", <input type="date" value={form.validFrom} onChange={(e) => set("validFrom", e.target.value)} className={cn(inputClass, "ltr-nums")} />)}
              {field("validUntil", isAr ? "ينتهي عند" : "Ends At", <input type="date" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} className={cn(inputClass, "ltr-nums")} />)}
              <div className="sm:col-span-2">{field("days", isAr ? "الأيام" : "Days", multi("days", dayOptions))}</div>
              {form.periods.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 sm:col-span-2">
                  {field(
                    `periods.${i}.from`,
                    isAr ? "من الساعة" : "From Time",
                    <input type="time" value={p.from} onChange={(e) => set("periods", form.periods.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} className={cn(inputClass, "ltr-nums")} />,
                  )}
                  {field(
                    `periods.${i}.to`,
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

          <FormSection title={isAr ? "نسبة خصم القسيمة" : "Coupon Discount"} icon={Tag}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {req(
                "discountMode",
                isAr ? "نوع الخصم" : "Discount Type",
                <select value={form.discountMode} onChange={(e) => set("discountMode", e.target.value as Form["discountMode"])} className={selectClass}>
                  <option value="">{isAr ? "يرجى الاختيار" : "Please Select"}</option>
                  <option value="FIXED">{isAr ? "ثابت" : "Fixed"}</option>
                  <option value="PERCENT">{isAr ? "النسبة المئوية" : "Percentage"}</option>
                </select>,
              )}
              {req("discountValue", isAr ? "مبلغ الخصم" : "Discount Amount", numberInput("discountValue", isAr ? "مبلغ الخصم" : "Discount Amount", { step: "0.01", min: 0.01 }))}
              {form.discountMode === "PERCENT" &&
                field("maxDiscountAmount", isAr ? "الحد الاقصي للخصم" : "Max Discount", numberInput("maxDiscountAmount", isAr ? "الحد الاقصي للخصم" : "Max Discount", { step: "0.01", min: 0.01 }))}
              <div className="flex flex-wrap items-end gap-x-5 gap-y-2 pb-2 sm:col-span-2">
                {check("isActive", isAr ? "مفعل" : "Active")}
                {check("addedDiscount", isAr ? "تطبيق خصم اضافى مع القسيمة" : "Apply on added discounts")}
                {check("otp", isAr ? "إرسال رمز التحقق" : "Send OTP")}
              </div>
              <p className="flex items-start gap-1.5 text-xs text-slate-500 sm:col-span-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                {isAr
                  ? "عند إلغاء \"تطبيق خصم اضافى\" تلغي القسيمة العرض الترويجي وخصومات الأصناف في الفاتورة. \"إرسال رمز التحقق\" يطلب رمزاً يُرسل إلى جوال العميل قبل تطبيق القسيمة."
                  : 'With "Apply on added discounts" off, the coupon cancels the promotion and line discounts on the invoice. "Send OTP" asks for a code sent to the customer\'s mobile before the coupon applies.'}
              </p>
            </div>
          </FormSection>

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

function HintIcon({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex cursor-help text-slate-400">
      <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
    </span>
  );
}
