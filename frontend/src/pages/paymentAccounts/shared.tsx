import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { inputClass } from "../../components/ui/formClasses";

export interface AccountOption {
  id: string;
  name: string;
  accountNumber: string;
  kind: "BANK" | "CASH" | "CHEQUE";
  isClosed: boolean;
}

export interface MovementDescription {
  subType: "OPENING_BALANCE" | "DEPOSIT" | "FUND_TRANSFER" | null;
  counterAccountName: string | null;
  docType: "SALE" | "SELL_RETURN" | "EXPENSE" | "PURCHASE" | null;
  docNumber: string | null;
  docId: string | null;
  party: string | null;
  paymentRefNo: string | null;
  addedBy: string;
}

export function usePaymentAccountOptions(params: { includeClosed?: boolean; kind?: string } = {}) {
  return useQuery({
    queryKey: ["payment-accounts", "dropdown", params],
    queryFn: async () =>
      (
        await api.get<ApiSuccess<AccountOption[]>>("/payment-accounts/dropdown", {
          params: { ...(params.includeClosed ? { includeClosed: "true" } : {}), ...(params.kind ? { kind: params.kind } : {}) },
        })
      ).data.data,
  });
}

/** Report filter options served by the accounting module itself, so a user who only has accounting
 * permissions still gets populated Created By / Customer Group / Customer filters. */
export function useAccountingFilterOptions() {
  return useQuery({
    queryKey: ["payment-accounts", "filter-options"],
    queryFn: async () =>
      (
        await api.get<ApiSuccess<{ users: { id: string; fullNameEn: string }[]; customerGroups: { id: string; nameEn: string; nameAr: string }[] }>>(
          "/payment-accounts/filter-options",
        )
      ).data.data,
  });
}

export function useAccountingCustomerSearch(search: string) {
  return useQuery({
    queryKey: ["payment-accounts", "customer-search", search],
    queryFn: async () =>
      (await api.get<ApiSuccess<{ id: string; nameEn: string; nameAr: string | null; phone: string; code: string }[]>>("/payment-accounts/customer-search", { params: { search } }))
        .data.data,
    enabled: search.trim().length > 0,
  });
}

/** Customer picker for a Filters popover (Sell Payments). The match list stays in flow - inside the
 * scrolling popover an absolutely positioned list would be clipped. */
export function AccountingCustomerFilter({
  value,
  onChange,
  isAr,
}: {
  value: { id: string; label: string } | null;
  onChange: (v: { id: string; label: string } | null) => void;
  isAr: boolean;
}) {
  const [search, setSearch] = useState("");
  const { data: results } = useAccountingCustomerSearch(search);
  return (
    <div>
      <input
        value={value ? value.label : search}
        onChange={(e) => {
          if (value) onChange(null);
          setSearch(e.target.value);
        }}
        placeholder={isAr ? "أي عميل" : "Any customer"}
        className={cn(inputClass, "w-full")}
      />
      {search && !value && (results ?? []).length > 0 && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {(results ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange({ id: c.id, label: `${isAr ? c.nameAr || c.nameEn : c.nameEn} (${c.phone})` });
                setSearch("");
              }}
              className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
            >
              {isAr ? c.nameAr || c.nameEn : c.nameEn} <span className="ltr-nums text-xs text-slate-400">({c.phone})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function errorMessage(err: unknown, isAr: boolean) {
  const fallback = isAr ? "حدث خطأ ما" : "Something went wrong";
  if (!isAxiosError(err)) return fallback;
  const data = err.response?.data as { message?: string; errors?: { message: string }[] } | undefined;
  return data?.errors?.[0]?.message ?? data?.message ?? fallback;
}

/** "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local"> defaults. */
export function localDateTimeValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function todayValue() {
  return localDateTimeValue().slice(0, 10);
}

const SUB_TYPE_LABEL: Record<string, { en: string; ar: string }> = {
  OPENING_BALANCE: { en: "Opening Balance", ar: "الرصيد الافتتاحي" },
  DEPOSIT: { en: "Deposit", ar: "إيداع" },
  FUND_TRANSFER: { en: "Fund Transfer", ar: "تحويل أموال" },
};

const DOC_LABEL: Record<string, { en: string; ar: string }> = {
  SALE: { en: "Sale", ar: "بيع" },
  SELL_RETURN: { en: "Sell Return", ar: "مرتجع مبيعات" },
  EXPENSE: { en: "Expense", ar: "مصروف" },
  PURCHASE: { en: "Purchase", ar: "شراء" },
};

/** Reference's AccountController::__getPaymentDetails(), rendered from structured data. */
export function MovementDescriptionCell({ d, type, isAr }: { d: MovementDescription; type: "DEBIT" | "CREDIT"; isAr: boolean }) {
  return (
    <div className="space-y-0.5 text-xs leading-relaxed text-slate-600">
      {d.subType && (
        <div className="font-medium text-slate-800">
          {isAr ? SUB_TYPE_LABEL[d.subType].ar : SUB_TYPE_LABEL[d.subType].en}
          {d.counterAccountName && (
            <span className="font-normal text-slate-500">
              {" "}
              ({type === "CREDIT" ? (isAr ? "من" : "From") : isAr ? "إلى" : "To"}: {d.counterAccountName})
            </span>
          )}
        </div>
      )}
      {d.docType && (
        <>
          <div className="font-medium text-slate-800">{isAr ? DOC_LABEL[d.docType].ar : DOC_LABEL[d.docType].en}</div>
          {d.party && (
            <div>
              <b>{d.docType === "SALE" || d.docType === "SELL_RETURN" ? (isAr ? "العميل" : "Customer") : isAr ? "المورد" : "Supplier"}:</b> {d.party}
            </div>
          )}
          {d.docNumber && (
            <div>
              <b>{d.docType === "SALE" || d.docType === "SELL_RETURN" ? (isAr ? "رقم الفاتورة" : "Invoice No") : isAr ? "الرقم المرجعي" : "Ref No"}:</b>{" "}
              {(d.docType === "SALE" || d.docType === "SELL_RETURN") && d.docId ? (
                <Link to={`/invoices/${d.docId}`} target="_blank" className="ltr-nums text-sky-600 hover:underline">
                  {d.docNumber}
                </Link>
              ) : (
                <span className="ltr-nums">{d.docNumber}</span>
              )}
            </div>
          )}
        </>
      )}
      {d.paymentRefNo && (
        <div>
          <b>{isAr ? "رقم مرجع الدفع" : "Pay reference no"}:</b> <span className="ltr-nums">{d.paymentRefNo}</span>
        </div>
      )}
      <div>
        <b>{isAr ? "أضيف بواسطة" : "Added By"}:</b> {d.addedBy}
      </div>
    </div>
  );
}
