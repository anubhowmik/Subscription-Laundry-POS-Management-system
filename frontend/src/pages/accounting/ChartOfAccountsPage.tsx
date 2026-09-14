import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { Account, AccountType, ApiSuccess } from "../../types/api";
import { formatMoney } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { confirmAction } from "../../stores/confirmStore";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, RowActions, RowActionButton } from "../../components/ui/Table";
import { ColumnVisibilityMenu, TableExportButtons } from "../../components/ui/TableToolbarControls";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { FormSection } from "../../components/ui/FormSection";
import { Plus, Pencil, Power, BookOpen } from "lucide-react";

const ACCOUNT_TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
const ACCOUNT_TYPE_LABELS: Record<AccountType, { en: string; ar: string }> = {
  ASSET: { en: "Asset", ar: "أصول" },
  LIABILITY: { en: "Liability", ar: "خصوم" },
  EQUITY: { en: "Equity", ar: "حقوق ملكية" },
  REVENUE: { en: "Revenue", ar: "إيرادات" },
  EXPENSE: { en: "Expense", ar: "مصروفات" },
};

export default function ChartOfAccountsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const { data: accounts } = useQuery({
    queryKey: ["accounting-accounts"],
    queryFn: async () => (await api.get<ApiSuccess<Account[]>>("/accounting/accounts")).data.data,
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/accounting/accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounting-accounts"] }),
  });

  const rows = (accounts ?? []).flatMap((parent) => [parent, ...(parent.childAccounts ?? [])]);

  const columns: { key: string; label: string; render: (a: Account) => ReactNode; exportValue: (a: Account) => string | number | null }[] = [
    {
      key: "code",
      label: isAr ? "الرمز" : "Code",
      render: (a) => <span className={a.parentAccountId ? "ps-4 ltr-nums" : "font-semibold ltr-nums"}>{a.code}</span>,
      exportValue: (a) => a.code,
    },
    {
      key: "name",
      label: isAr ? "الاسم" : "Name",
      render: (a) => (
        <>
          {a.parentAccountId ? "— " : ""}
          {isAr ? a.nameAr || a.nameEn : a.nameEn}
        </>
      ),
      exportValue: (a) => (isAr ? a.nameAr || a.nameEn : a.nameEn),
    },
    {
      key: "accountType",
      label: isAr ? "النوع" : "Type",
      render: (a) => (isAr ? ACCOUNT_TYPE_LABELS[a.accountType].ar : ACCOUNT_TYPE_LABELS[a.accountType].en),
      exportValue: (a) => ACCOUNT_TYPE_LABELS[a.accountType].en,
    },
    {
      key: "balance",
      label: isAr ? "الرصيد" : "Balance",
      render: (a) => <span className="ltr-nums">{formatMoney(a.balance, currency, locale)}</span>,
      exportValue: (a) => a.balance,
    },
    {
      key: "status",
      label: isAr ? "الحالة" : "Status",
      render: (a) => (
        <>
          <Badge variant={a.isActive ? "success" : "neutral"}>{a.isActive ? (isAr ? "نشط" : "Active") : isAr ? "غير نشط" : "Inactive"}</Badge>
          {a.isSystemAccount && <Badge variant="info" className="ms-1.5">{isAr ? "نظامي" : "System"}</Badge>}
        </>
      ),
      exportValue: (a) => (a.isActive ? "Active" : "Inactive"),
    },
  ];
  const columnVisibility = useColumnVisibility(
    "chart-of-accounts",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "دليل الحسابات" : "Chart of Accounts"}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> {isAr ? "إضافة حساب" : "Add Account"}
          </Button>
        }
      />

      <TableContainer>
        <TableToolbar>
          <div className="ms-auto flex items-center gap-1.5">
            <ColumnVisibilityMenu
              columns={columns.map((c) => ({ key: c.key, label: c.label }))}
              isVisible={columnVisibility.isVisible}
              onToggle={columnVisibility.toggle}
              isAr={isAr}
            />
            <TableExportButtons
              title={isAr ? "دليل الحسابات" : "Chart of Accounts"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => rows.map((a) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(a)])))}
              isAr={isAr}
            />
          </div>
        </TableToolbar>
        <TableScroll>
          <Table>
            <THead>
              <tr>
                {visibleColumns.map((c) => (
                  <Th key={c.key}>{c.label}</Th>
                ))}
                <Th>{isAr ? "إجراءات" : "Actions"}</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {visibleColumns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      {c.render(a)}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <RowActions>
                      <RowActionButton
                        icon={Pencil}
                        label={isAr ? "تعديل" : "Edit"}
                        onClick={() => {
                          setEditing(a);
                          setFormOpen(true);
                        }}
                      />
                      {a.isActive && !a.isSystemAccount && (
                        <RowActionButton
                          icon={Power}
                          label={isAr ? "تعطيل" : "Deactivate"}
                          variant="danger"
                          onClick={async () => {
                            if (await confirmAction({ message: isAr ? `تعطيل "${a.nameEn}"؟` : `Deactivate "${a.nameEn}"?`, danger: true })) {
                              deactivateMutation.mutate(a.id);
                            }
                          }}
                        />
                      )}
                    </RowActions>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-400">
                    {isAr ? "لا توجد حسابات بعد" : "No accounts yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableScroll>
      </TableContainer>

      {formOpen && (
        <AccountFormModal
          isAr={isAr}
          editing={editing}
          accounts={accounts ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}

function AccountFormModal({
  isAr,
  editing,
  accounts,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  editing: Account | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [code, setCode] = useState(editing?.code ?? "");
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(editing?.nameAr ?? "");
  const [accountType, setAccountType] = useState<AccountType>(editing?.accountType ?? "ASSET");
  const [parentAccountId, setParentAccountId] = useState(editing?.parentAccountId ?? "");
  const [openingBalance, setOpeningBalance] = useState(editing?.openingBalance ?? "0");
  const [error, setError] = useState<string | null>(null);

  const parentOptions = accounts.filter((a) => a.accountType === accountType && a.id !== editing?.id);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: code.trim(),
        nameEn,
        nameAr: nameAr || undefined,
        accountType,
        parentAccountId: parentAccountId || null,
        openingBalance: Number(openingBalance || 0),
      };
      if (editing) return api.put(`/accounting/accounts/${editing.id}`, payload);
      return api.post("/accounting/accounts", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounting-accounts"] });
      onSaved();
    },
    onError: (err) => setError(isAxiosError(err) ? (err.response?.data?.message ?? t("common.somethingWentWrong")) : t("common.somethingWentWrong")),
  });

  const canSubmit = code.trim().length > 0 && nameEn.trim().length > 0;

  return (
    <Modal title={editing ? (isAr ? "تعديل الحساب" : "Edit Account") : isAr ? "إضافة حساب" : "Add Account"} onClose={onClose} size="lg">
      <div className="space-y-4">
        <FormSection title={isAr ? "بيانات الحساب" : "Account Details"} icon={BookOpen}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "الرمز" : "Code"}</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="1010" autoFocus className={inputClass + " ltr-nums"} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "النوع" : "Account Type"}</label>
              <select
                value={accountType}
                onChange={(e) => {
                  setAccountType(e.target.value as AccountType);
                  setParentAccountId("");
                }}
                disabled={editing?.isSystemAccount}
                className={selectClass}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {isAr ? ACCOUNT_TYPE_LABELS[t].ar : ACCOUNT_TYPE_LABELS[t].en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</label>
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</label>
              <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الحساب الأب" : "Parent Account"}</label>
              <select value={parentAccountId} onChange={(e) => setParentAccountId(e.target.value)} className={selectClass}>
                <option value="">{isAr ? "بلا (حساب رئيسي)" : "None (top-level)"}</option>
                {parentOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {isAr ? a.nameAr || a.nameEn : a.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الرصيد الافتتاحي" : "Opening Balance"}</label>
              <input type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className={inputClass + " ltr-nums"} />
            </div>
          </div>
        </FormSection>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" fullWidth onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" fullWidth disabled={!canSubmit || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
