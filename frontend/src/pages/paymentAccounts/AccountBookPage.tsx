import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Pencil, Trash2, CalendarDays, ArrowLeftRight, User } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { confirmAction } from "../../stores/confirmStore";
import { useAuth } from "../../contexts/AuthContext";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import { BackButton } from "../../components/ui/BackButton";
import { IconInput, IconSelect } from "../../components/ui/IconInput";
import { TableContainer, TableScroll, Table, THead, Th, RowActions, RowActionButton } from "../../components/ui/Table";
import { labelClass } from "../../components/ui/formClasses";
import { EditTransactionModal, type PaymentAccountRow } from "./PaymentAccountModals";
import { MovementDescriptionCell, errorMessage, localDateTimeValue, useAccountingFilterOptions, type MovementDescription } from "./shared";

interface BookRow {
  id: string;
  operationDate: string;
  type: "DEBIT" | "CREDIT";
  subType: "OPENING_BALANCE" | "DEPOSIT" | "FUND_TRANSFER" | null;
  amount: string;
  note: string | null;
  referenceNo: string | null;
  balance: string;
  description: MovementDescription;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateTimeValue(d).slice(0, 10);
}

export default function AccountBookPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  // Reference's account book opens on the last 7 days.
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(daysAgo(0));
  const [type, setType] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [editTxnId, setEditTxnId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, error: loadError } = useQuery({
    queryKey: ["payment-account-book", id, from, to, type, createdBy],
    retry: false,
    queryFn: async () =>
      (
        await api.get<ApiSuccess<{ account: PaymentAccountRow; rows: BookRow[] }>>(`/payment-accounts/${id}/book`, {
          params: { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(type ? { type } : {}), ...(createdBy ? { createdBy } : {}) },
        })
      ).data.data,
  });
  const { data: filterOptions } = useAccountingFilterOptions();
  const users = filterOptions?.users;

  const deleteTxn = useMutation({
    mutationFn: async (txnId: string) => api.delete(`/payment-accounts/transactions/${txnId}`),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["payment-account-book"] });
      qc.invalidateQueries({ queryKey: ["payment-accounts"] });
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });

  const account = data?.account;
  const rows = data?.rows ?? [];
  // Reference's account book shows money-in (credit movements) under its "Debit" header and
  // money-out under "Credit" - a bank-statement-style view; kept as-is so the columns read the same.
  const totalIn = rows.filter((r) => r.type === "CREDIT").reduce((s, r) => s + Number(r.amount), 0);
  const totalOut = rows.filter((r) => r.type === "DEBIT").reduce((s, r) => s + Number(r.amount), 0);
  const typeLabel = account?.accountType ? `${account.accountType.parent ? `${account.accountType.parent.name} - ` : ""}${account.accountType.name}` : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton to="/payment-accounts" label={isAr ? "قائمة الحسابات" : "List Accounts"} />
        <PageHeader title={isAr ? "دفتر الحساب" : "Account Book"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <dl className="space-y-3 text-sm">
            {[
              [isAr ? "اسم الحساب" : "Account Name", account?.name],
              [isAr ? "نوع الحساب" : "Account Type", typeLabel],
              [isAr ? "رقم الحساب" : "Account Number", account?.accountNumber],
              [isAr ? "الرصيد" : "Balance", account ? formatMoney(account.balance, currency, locale) : ""],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
                <dt className="font-semibold text-slate-600">{label}:</dt>
                <dd className="ltr-nums text-end text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{isAr ? "عوامل التصفية" : "Filters"}:</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{isAr ? "من تاريخ" : "Date From"}</label>
              <IconInput icon={CalendarDays} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ltr-nums" />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "إلى تاريخ" : "Date To"}</label>
              <IconInput icon={CalendarDays} type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ltr-nums" />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "نوع الحركة" : "Transaction Type"}:</label>
              <IconSelect icon={ArrowLeftRight} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">{t("common.all")}</option>
                <option value="DEBIT">{isAr ? "مدين" : "Debit"}</option>
                <option value="CREDIT">{isAr ? "دائن" : "Credit"}</option>
              </IconSelect>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "أنشئ بواسطة" : "Created By"}:</label>
              <IconSelect icon={User} value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}>
                <option value="">{t("common.all")}</option>
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullNameEn}
                  </option>
                ))}
              </IconSelect>
            </div>
          </div>
        </Card>
      </div>

      {loadError && <Alert variant="danger">{errorMessage(loadError, isAr)}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <TableContainer>
        <TableScroll>
          <Table>
            <THead>
              <tr>
                <Th>{isAr ? "التاريخ" : "Date"}</Th>
                <Th>{isAr ? "الوصف" : "Description"}</Th>
                <Th>{isAr ? "ملاحظة" : "Note"}</Th>
                <Th>{isAr ? "أضيف بواسطة" : "Added By"}</Th>
                <Th>{isAr ? "مدين" : "Debit"}</Th>
                <Th>{isAr ? "دائن" : "Credit"}</Th>
                <Th>{isAr ? "الرصيد" : "Balance"}</Th>
                <Th>{t("common.actions")}</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <span className="ltr-nums">{new Date(r.operationDate).toLocaleString(locale)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <MovementDescriptionCell d={r.description} type={r.type} isAr={isAr} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {r.note}
                    {r.referenceNo && <div className="ltr-nums text-xs text-slate-400">{r.referenceNo}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.description.addedBy}</td>
                  <td className="px-4 py-3 font-medium text-emerald-700">
                    {r.type === "CREDIT" && <span className="ltr-nums whitespace-nowrap">{formatMoney(r.amount, currency, locale)}</span>}
                  </td>
                  <td className="px-4 py-3 font-medium text-red-600">
                    {r.type === "DEBIT" && <span className="ltr-nums whitespace-nowrap">{formatMoney(r.amount, currency, locale)}</span>}
                  </td>
                  <td className={cn("px-4 py-3 font-medium", Number(r.balance) < 0 ? "text-red-600" : "text-slate-800")}>
                    <span className="ltr-nums whitespace-nowrap">{formatMoney(r.balance, currency, locale)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <RowActions align="start">
                      {r.subType && can("payment_accounts.edit_transaction") && (
                        <RowActionButton icon={Pencil} label={t("common.edit")} onClick={() => setEditTxnId(r.id)} />
                      )}
                      {(r.subType === "DEPOSIT" || r.subType === "FUND_TRANSFER") && can("payment_accounts.delete_transaction") && (
                        <RowActionButton
                          icon={Trash2}
                          label={isAr ? "حذف" : "Delete"}
                          variant="danger"
                          onClick={async () => {
                            if (await confirmAction({ message: isAr ? "هل أنت متأكد؟" : "Are you sure?", danger: true })) deleteTxn.mutate(r.id);
                          }}
                        />
                      )}
                    </RowActions>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    {t("common.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-semibold text-slate-700">
                <td colSpan={4} className="px-4 py-3 text-center">
                  {t("common.total")}:
                </td>
                <td className="px-4 py-3">
                  <span className="ltr-nums whitespace-nowrap">{formatMoney(totalIn, currency, locale)}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="ltr-nums whitespace-nowrap">{formatMoney(totalOut, currency, locale)}</span>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </Table>
        </TableScroll>
      </TableContainer>

      {editTxnId && <EditTransactionModal txnId={editTxnId} isAr={isAr} onClose={() => setEditTxnId(null)} />}
    </div>
  );
}
