import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";

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
