import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Plus, BookOpen, Pencil, ArrowLeftRight, Banknote, Power, List as ListIcon, Book, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { confirmAction } from "../../stores/confirmStore";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { SearchInput } from "../../components/ui/SearchInput";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, RowActions, RowActionButton, RowActionLink } from "../../components/ui/Table";
import { selectClass } from "../../components/ui/formClasses";
import { TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { FilterField, scopeParams, useReportAppScope } from "../reports/reportShared";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import {
  AccountFormModal,
  AccountTypeModal,
  DepositModal,
  FundTransferModal,
  useAccountTypes,
  type PaymentAccountRow,
} from "./PaymentAccountModals";
import { errorMessage } from "./shared";

export default function PaymentAccountsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();
  const appScope = useReportAppScope();

  const [tab, setTab] = useState<"accounts" | "types">("accounts");
  const [status, setStatus] = useState<"active" | "closed">("active");
  const [search, setSearch] = useState("");
  const [formAccount, setFormAccount] = useState<PaymentAccountRow | null | undefined>(undefined);
  const [depositFor, setDepositFor] = useState<PaymentAccountRow | null>(null);
  const [transferFrom, setTransferFrom] = useState<PaymentAccountRow | null>(null);
  const [typeModal, setTypeModal] = useState<{ id: string; name: string; parentAccountTypeId: string | null } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["payment-accounts", "list", status, search, appScope],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PaymentAccountRow[]>>("/payment-accounts", { params: { status, ...(search ? { search } : {}), ...scopeParams(appScope) } });
      return { rows: res.data.data, notLinkedPayments: (res.data.meta as { notLinkedPayments?: number } | undefined)?.notLinkedPayments ?? 0 };
    },
  });
  const { data: types } = useAccountTypes();

  const toggleClosed = useMutation({
    mutationFn: async ({ id, close }: { id: string; close: boolean }) => api.put(`/payment-accounts/${id}/${close ? "close" : "activate"}`),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["payment-accounts"] });
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });
  const deleteType = useMutation({
    mutationFn: async (id: string) => api.delete(`/payment-accounts/types/${id}`),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["payment-account-types"] });
      qc.invalidateQueries({ queryKey: ["payment-accounts"] });
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });

  const rows = data?.rows ?? [];
  const totalBalance = rows.reduce((s, r) => s + Number(r.balance), 0);
  // Reference: a sub-type's parent fills "Account Type", the sub-type itself "Account Sub Type";
  // a top-level type alone fills "Account Type" and leaves Sub Type blank.
  const typeName = (a: PaymentAccountRow) => (a.accountType ? a.accountType.parent?.name ?? a.accountType.name : "");
  const subTypeName = (a: PaymentAccountRow) => (a.accountType?.parent ? a.accountType.name : "");
  const detailsText = (a: PaymentAccountRow) => (a.accountDetails ?? []).filter((d) => d.label && d.value).map((d) => `${d.label} : ${d.value}`);
  const columns = [
    { key: "name", label: isAr ? "الاسم" : "Name" },
    { key: "type", label: isAr ? "نوع الحساب" : "Account Type" },
    { key: "subType", label: isAr ? "نوع الحساب الفرعي" : "Account Sub Type" },
    { key: "number", label: isAr ? "رقم الحساب" : "Account Number" },
    { key: "note", label: isAr ? "ملاحظة" : "Note" },
    { key: "balance", label: isAr ? "الرصيد" : "Balance" },
    { key: "details", label: isAr ? "تفاصيل الحساب" : "Account Details" },
    { key: "addedBy", label: isAr ? "أضيفت بواسطة" : "Added By" },
  ];
  const columnVisibility = useColumnVisibility("payment-accounts", columns.map((c) => c.key));
  const show = columnVisibility.isVisible;
  const visibleCount = columns.filter((c) => show(c.key)).length;

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "الحسابات" : "Accounting"} subtitle={isAr ? "ادارة الحسابات" : "Manage your account"} />

      {(data?.notLinkedPayments ?? 0) > 0 && (
        <Alert variant="danger">
          {isAr ? (
            <>
              دفعات <b>{data!.notLinkedPayments}</b> غير مرتبطة بأي حساب.{" "}
            </>
          ) : (
            <>
              Total <b>{data!.notLinkedPayments}</b> payments not linked with any account.{" "}
            </>
          )}
          <Link to="/payment-accounts/payment-account-report" className="font-semibold underline">
            {isAr ? "عرض التفاصيل" : "View Details"}
          </Link>
        </Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex gap-6 border-b border-slate-200">
        {(
          [
            ["accounts", Book, isAr ? "الحسابات" : "Accounts"],
            ["types", ListIcon, isAr ? "أنواع الحسابات" : "Account Types"],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-sm font-semibold transition-colors",
              tab === key ? "border-sky-600 text-sky-600" : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === "accounts" && (
        <TableContainer>
          <TableToolbar>
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search")} className="max-w-xs" />
            {/* Reference: the account-status select (Active / Closed), opening on Active. */}
            <FiltersMenu activeCount={status === "closed" ? 1 : 0} onClear={() => setStatus("active")} isAr={isAr}>
              <FilterField label={isAr ? "حالة الحساب" : "Account Status"}>
                <select value={status} onChange={(e) => setStatus(e.target.value as "active" | "closed")} className={cn(selectClass, "w-full")}>
                  <option value="active">{isAr ? "نشط" : "Active"}</option>
                  <option value="closed">{isAr ? "مغلق" : "Closed"}</option>
                </select>
              </FilterField>
            </FiltersMenu>
            <div className="ms-auto flex items-center gap-1.5">
              <ColumnVisibilityMenu columns={columns} isVisible={columnVisibility.isVisible} onToggle={columnVisibility.toggle} isAr={isAr} />
              <TableExportButtons
                title={isAr ? "الحسابات" : "Accounts"}
                columns={columns.filter((c) => show(c.key))}
                getRows={async () =>
                  rows.map((a) => ({
                    name: a.name,
                    type: typeName(a),
                    subType: subTypeName(a),
                    number: a.accountNumber,
                    note: a.note,
                    balance: Number(a.balance),
                    details: detailsText(a).join(", "),
                    addedBy: a.createdByUser.fullNameEn,
                  }))
                }
                isAr={isAr}
              />
              <Button onClick={() => setFormAccount(null)}>
                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {t("common.add")}
              </Button>
            </div>
          </TableToolbar>
          <TableScroll>
            <Table>
              <THead>
                <tr>
                  {columns.filter((c) => show(c.key)).map((c) => (
                    <Th key={c.key}>{c.label}</Th>
                  ))}
                  <Th>{t("common.actions")}</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((a) => {
                  return (
                    <tr key={a.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                      {show("name") && (
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {a.name} {a.isClosed && <Badge variant="danger">{isAr ? "مغلق" : "Closed"}</Badge>}
                        </td>
                      )}
                      {show("type") && <td className="px-4 py-3">{typeName(a)}</td>}
                      {show("subType") && <td className="px-4 py-3">{subTypeName(a)}</td>}
                      {show("number") && (
                        <td className="px-4 py-3">
                          <span className="ltr-nums">{a.accountNumber}</span>
                        </td>
                      )}
                      {show("note") && <td className="px-4 py-3 text-slate-500">{a.note}</td>}
                      {show("balance") && (
                        <td className="px-4 py-3 font-medium">
                          <span className="ltr-nums whitespace-nowrap">{formatMoney(a.balance, currency, locale)}</span>
                        </td>
                      )}
                      {show("details") && (
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {detailsText(a).map((line, i) => (
                            <div key={i}>{line}</div>
                          ))}
                        </td>
                      )}
                      {show("addedBy") && <td className="px-4 py-3 text-slate-500">{a.createdByUser.fullNameEn}</td>}
                      <td className="px-4 py-3">
                        <RowActions align="start">
                          <RowActionButton icon={Pencil} label={t("common.edit")} onClick={() => setFormAccount(a)} />
                          <RowActionLink icon={BookOpen} label={isAr ? "دفتر الحسابات" : "Account Book"} variant="warning" to={`/payment-accounts/${a.id}`} />
                          {!a.isClosed ? (
                            <>
                              <RowActionButton icon={ArrowLeftRight} label={isAr ? "تحويل أموال" : "Fund Transfer"} onClick={() => setTransferFrom(a)} />
                              <RowActionButton icon={Banknote} label={isAr ? "إيداع" : "Deposit"} variant="success" onClick={() => setDepositFor(a)} />
                              <RowActionButton
                                icon={Power}
                                label={isAr ? "إغلاق" : "Close"}
                                variant="danger"
                                onClick={async () => {
                                  if (await confirmAction({ message: isAr ? "هل أنت متأكد؟" : "Are you sure?", danger: true })) toggleClosed.mutate({ id: a.id, close: true });
                                }}
                              />
                            </>
                          ) : (
                            <RowActionButton
                              icon={Power}
                              label={isAr ? "تفعيل" : "Activate"}
                              variant="success"
                              onClick={async () => {
                                if (await confirmAction({ message: isAr ? "هل أنت متأكد؟" : "Are you sure?" })) toggleClosed.mutate({ id: a.id, close: false });
                              }}
                            />
                          )}
                        </RowActions>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={visibleCount + 1} className="px-4 py-8 text-center text-slate-400">
                      {t("common.noResults")}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-semibold text-slate-700">
                  <td colSpan={Math.max(1, ["name", "type", "subType", "number", "note"].filter(show).length)} className="px-4 py-3 text-center">
                    {t("common.total")}:
                  </td>
                  {show("balance") && (
                    <td className="px-4 py-3">
                      <span className="ltr-nums whitespace-nowrap">{formatMoney(totalBalance, currency, locale)}</span>
                    </td>
                  )}
                  <td colSpan={["details", "addedBy"].filter(show).length + 1} />
                </tr>
              </tfoot>
            </Table>
          </TableScroll>
        </TableContainer>
      )}

      {tab === "types" && (
        <TableContainer>
          <TableToolbar>
            <div className="ms-auto">
              <Button onClick={() => setTypeModal(null)}>
                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {t("common.add")}
              </Button>
            </div>
          </TableToolbar>
          <TableScroll>
            <Table>
              <THead>
                <tr>
                  <Th>{isAr ? "الاسم" : "Name"}</Th>
                  <Th>{t("common.actions")}</Th>
                </tr>
              </THead>
              <tbody>
                {(types ?? []).flatMap((type) => [
                  { ...type, isSub: false },
                  ...type.subTypes.map((s) => ({ ...s, subTypes: [], isSub: true })),
                ]).map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className={cn("px-4 py-3", row.isSub ? "ps-10 text-slate-600" : "font-semibold text-slate-800")}>
                      {row.isSub && "-- "}
                      {row.name}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions align="start">
                        <RowActionButton icon={Pencil} label={t("common.edit")} onClick={() => setTypeModal({ id: row.id, name: row.name, parentAccountTypeId: row.parentAccountTypeId })} />
                        <RowActionButton
                          icon={Trash2}
                          label={isAr ? "حذف" : "Delete"}
                          variant="danger"
                          onClick={async () => {
                            if (await confirmAction({ message: isAr ? "هل أنت متأكد؟" : "Are you sure?", danger: true })) deleteType.mutate(row.id);
                          }}
                        />
                      </RowActions>
                    </td>
                  </tr>
                ))}
                {(types ?? []).length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                      {t("common.noResults")}
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </TableScroll>
        </TableContainer>
      )}

      {formAccount !== undefined && <AccountFormModal account={formAccount} isAr={isAr} onClose={() => setFormAccount(undefined)} />}
      {depositFor && <DepositModal account={depositFor} isAr={isAr} onClose={() => setDepositFor(null)} />}
      {transferFrom && <FundTransferModal account={transferFrom} isAr={isAr} onClose={() => setTransferFrom(null)} />}
      {typeModal !== undefined && <AccountTypeModal type={typeModal} isAr={isAr} onClose={() => setTypeModal(undefined)} />}
    </div>
  );
}
