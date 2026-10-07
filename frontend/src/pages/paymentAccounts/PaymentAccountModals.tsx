import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Banknote, CalendarDays } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { IconInput } from "../../components/ui/IconInput";
import { labelClass, inputClass, selectClass, textareaClass } from "../../components/ui/formClasses";
import { errorMessage, localDateTimeValue, usePaymentAccountOptions } from "./shared";

export interface AccountTypeNode {
  id: string;
  name: string;
  parentAccountTypeId: string | null;
  subTypes: { id: string; name: string; parentAccountTypeId: string | null }[];
}

export interface PaymentAccountRow {
  id: string;
  name: string;
  accountNumber: string;
  kind: "BANK" | "CASH" | "CHEQUE";
  accountTypeId: string | null;
  accountDetails: { label: string; value: string }[] | null;
  note: string | null;
  isClosed: boolean;
  isMajor: boolean;
  balance: string;
  accountType: { id: string; name: string; parent: { id: string; name: string } | null } | null;
  createdByUser: { fullNameEn: string };
}

export function useAccountTypes() {
  return useQuery({
    queryKey: ["payment-account-types"],
    queryFn: async () => (await api.get<ApiSuccess<AccountTypeNode[]>>("/payment-accounts/types")).data.data,
  });
}

function invalidateAccounts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["payment-accounts"] });
  qc.invalidateQueries({ queryKey: ["payment-account-book"] });
}

// --- Add / Edit Account (account/create.blade.php) ---------------------------------------------

export function AccountFormModal({ account, isAr, onClose }: { account: PaymentAccountRow | null; isAr: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: types } = useAccountTypes();
  const [name, setName] = useState(account?.name ?? "");
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? "");
  const [kind, setKind] = useState<"BANK" | "CASH" | "CHEQUE">(account?.kind ?? "BANK");
  const [accountTypeId, setAccountTypeId] = useState(account?.accountTypeId ?? "");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [details, setDetails] = useState<{ label: string; value: string }[]>(() =>
    Array.from({ length: 6 }, (_, i) => account?.accountDetails?.[i] ?? { label: "", value: "" }),
  );
  const [note, setNote] = useState(account?.note ?? "");
  const [isMajor, setIsMajor] = useState(account?.isMajor ?? false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        accountNumber,
        kind,
        accountTypeId: accountTypeId || null,
        accountDetails: details,
        note: note || null,
        isMajor,
        ...(account ? {} : { openingBalance: Number(openingBalance) || 0 }),
      };
      return account ? api.put(`/payment-accounts/${account.id}`, body) : api.post("/payment-accounts", body);
    },
    onSuccess: () => {
      invalidateAccounts(qc);
      onClose();
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });

  return (
    <Modal
      title={account ? (isAr ? "تعديل الحساب" : "Edit Account") : isAr ? "إضافة حساب" : "Add Account"}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || !accountNumber.trim() || mutation.isPending}>
            {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "الاسم" : "Name"}:*</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isAr ? "الاسم" : "Name"} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "رقم الحساب" : "Account Number"}:*</label>
          <IconInput icon={Hash} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder={isAr ? "رقم الحساب" : "Account Number"} className="ltr-nums" />
        </div>
        <div className="flex flex-wrap gap-5">
          {(
            [
              ["BANK", isAr ? "حساب بنكي" : "Bank Account"],
              ["CASH", isAr ? "نقدي" : "Cash"],
              ["CHEQUE", isAr ? "شيك" : "Cheque"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="kind" checked={kind === value} onChange={() => setKind(value)} className="h-4 w-4 border-slate-300 text-sky-600" />
              {label}
            </label>
          ))}
        </div>
        <div>
          <label className={labelClass}>{isAr ? "نوع الحساب" : "Account Type"}:</label>
          <select value={accountTypeId} onChange={(e) => setAccountTypeId(e.target.value)} className={selectClass}>
            <option value="">{isAr ? "الرجاء الاختيار" : "Please Select"}</option>
            {(types ?? []).map((t) => (
              <optgroup key={t.id} label={t.name}>
                <option value={t.id}>{t.name}</option>
                {t.subTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {!account && (
          <div>
            <label className={labelClass}>{isAr ? "الرصيد الافتتاحي" : "Opening Balance"}:</label>
            <input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder={isAr ? "الرصيد الافتتاحي" : "Opening Balance"} className={cn(inputClass, "ltr-nums")} />
          </div>
        )}
        <div>
          <label className={labelClass}>{isAr ? "تفاصيل الحساب" : "Account Details"}:</label>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">{isAr ? "التسمية" : "Label"}</th>
                  <th className="px-3 py-2 text-start">{isAr ? "القيمة" : "Value"}</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">
                      <input
                        value={d.label}
                        onChange={(e) => setDetails((prev) => prev.map((row, j) => (j === i ? { ...row, label: e.target.value } : row)))}
                        className={cn(inputClass, "py-1.5")}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={d.value}
                        onChange={(e) => setDetails((prev) => prev.map((row, j) => (j === i ? { ...row, value: e.target.value } : row)))}
                        className={cn(inputClass, "py-1.5")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <label className={labelClass}>{isAr ? "ملاحظة" : "Note"}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder={isAr ? "ملاحظة" : "Note"} className={textareaClass} />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={isMajor} onChange={(e) => setIsMajor(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          {isAr ? "حساب رئيسي" : "Major Account"}
        </label>
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}

// --- Add / Edit Account Type (account_types/create.blade.php) ----------------------------------

export function AccountTypeModal({
  type,
  isAr,
  onClose,
}: {
  type: { id: string; name: string; parentAccountTypeId: string | null } | null;
  isAr: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: types } = useAccountTypes();
  const [name, setName] = useState(type?.name ?? "");
  const [parentAccountTypeId, setParentAccountTypeId] = useState(type?.parentAccountTypeId ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = { name, parentAccountTypeId: parentAccountTypeId || null };
      return type ? api.put(`/payment-accounts/types/${type.id}`, body) : api.post("/payment-accounts/types", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-account-types"] });
      invalidateAccounts(qc);
      onClose();
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });

  return (
    <Modal
      title={type ? (isAr ? "تعديل نوع الحساب" : "Edit Account Type") : isAr ? "إضافة نوع حساب" : "Add Account Type"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "الاسم" : "Name"}:*</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isAr ? "الاسم" : "Name"} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "نوع الحساب الأب" : "Parent Account Type"}:</label>
          <select value={parentAccountTypeId} onChange={(e) => setParentAccountTypeId(e.target.value)} className={selectClass}>
            <option value="">{isAr ? "الرجاء الاختيار" : "Please Select"}</option>
            {(types ?? [])
              .filter((t) => t.id !== type?.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}

// --- Deposit (account/deposit.blade.php) -------------------------------------------------------

export function DepositModal({ account, isAr, onClose }: { account: { id: string; name: string }; isAr: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: accounts } = usePaymentAccountOptions();
  const [accountId, setAccountId] = useState(account.id);
  const [amount, setAmount] = useState("0");
  const [fromAccountId, setFromAccountId] = useState("");
  const [operationDate, setOperationDate] = useState(localDateTimeValue());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/payment-accounts/deposit", {
        accountId,
        amount: Number(amount),
        fromAccountId: fromAccountId || null,
        operationDate: new Date(operationDate).toISOString(),
        note: note || undefined,
      }),
    onSuccess: () => {
      invalidateAccounts(qc);
      onClose();
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });

  return (
    <Modal
      title={isAr ? "إيداع" : "Deposit"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={() => mutation.mutate()} disabled={!(Number(amount) > 0) || !operationDate || mutation.isPending}>
            {mutation.isPending ? "…" : isAr ? "إرسال" : "Submit"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          <b>{isAr ? "الحساب المحدد" : "Selected Account"}</b>: {account.name}
        </p>
        <div>
          <label className={labelClass}>{isAr ? "إيداع إلى" : "Deposit To"}:</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectClass}>
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{isAr ? "المبلغ" : "Amount"}:*</label>
          <IconInput icon={Banknote} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="ltr-nums" />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "إيداع من" : "Deposit From"}:</label>
          <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} className={selectClass}>
            <option value="">{isAr ? "الرجاء الاختيار" : "Please Select"}</option>
            {(accounts ?? [])
              .filter((a) => a.id !== accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{isAr ? "التاريخ" : "Date"}:*</label>
          <IconInput icon={CalendarDays} type="datetime-local" value={operationDate} onChange={(e) => setOperationDate(e.target.value)} className="ltr-nums" />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "ملاحظة" : "Note"}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder={isAr ? "ملاحظة" : "Note"} className={textareaClass} />
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}

// --- Fund Transfer (account/transfer.blade.php) ------------------------------------------------

export function FundTransferModal({ account, isAr, onClose }: { account: { id: string; name: string }; isAr: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  // Reference: only bank accounts are offered as the transfer destination.
  const { data: bankAccounts } = usePaymentAccountOptions({ kind: "BANK" });
  const targets = (bankAccounts ?? []).filter((a) => a.id !== account.id);
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("0");
  const [referenceNo, setReferenceNo] = useState("");
  const [operationDate, setOperationDate] = useState(localDateTimeValue());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const effectiveTo = toAccountId || targets[0]?.id || "";

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/payment-accounts/fund-transfer", {
        fromAccountId: account.id,
        toAccountId: effectiveTo,
        amount: Number(amount),
        referenceNo: referenceNo || undefined,
        operationDate: new Date(operationDate).toISOString(),
        note: note || undefined,
      }),
    onSuccess: () => {
      invalidateAccounts(qc);
      onClose();
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });

  return (
    <Modal
      title={isAr ? "تحويل أموال" : "Fund Transfer"}
      subtitle={`${isAr ? "من" : "From"}: ${account.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={() => mutation.mutate()} disabled={!effectiveTo || !(Number(amount) > 0) || !operationDate || mutation.isPending}>
            {mutation.isPending ? "…" : isAr ? "إرسال" : "Submit"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "تحويل إلى" : "Transfer To"}:*</label>
          <select value={effectiveTo} onChange={(e) => setToAccountId(e.target.value)} className={selectClass}>
            {targets.length === 0 && <option value="">{isAr ? "لا توجد حسابات بنكية" : "No bank accounts"}</option>}
            {targets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{isAr ? "المبلغ" : "Amount"}:*</label>
          <IconInput icon={Banknote} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="ltr-nums" />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "الرقم المرجعي" : "Ref No"}:</label>
          <IconInput icon={Hash} value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder={isAr ? "الرقم المرجعي" : "Ref No"} className="ltr-nums" />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "التاريخ" : "Date"}:*</label>
          <IconInput icon={CalendarDays} type="datetime-local" value={operationDate} onChange={(e) => setOperationDate(e.target.value)} className="ltr-nums" />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "ملاحظة" : "Note"}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder={isAr ? "ملاحظة" : "Note"} className={textareaClass} />
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}

// --- Edit movement (account/edit_account_transaction.blade.php) --------------------------------

interface EditableTxn {
  id: string;
  type: "DEBIT" | "CREDIT";
  subType: "OPENING_BALANCE" | "DEPOSIT" | "FUND_TRANSFER";
  amount: string;
  operationDate: string;
  note: string | null;
  paymentAccountId: string;
  paymentAccount: { name: string };
  counterAccountId: string | null;
}

export function EditTransactionModal({ txnId, isAr, onClose }: { txnId: string; isAr: boolean; onClose: () => void }) {
  const { data: txn } = useQuery({
    queryKey: ["payment-account-txn", txnId],
    queryFn: async () => (await api.get<ApiSuccess<EditableTxn>>(`/payment-accounts/transactions/${txnId}`)).data.data,
  });
  if (!txn) return null;
  return <EditTransactionForm txn={txn} isAr={isAr} onClose={onClose} />;
}

function EditTransactionForm({ txn, isAr, onClose }: { txn: EditableTxn; isAr: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: accounts } = usePaymentAccountOptions();
  const [accountId, setAccountId] = useState(txn.paymentAccountId);
  const [amount, setAmount] = useState(String(Number(txn.amount)));
  const [counterAccountId, setCounterAccountId] = useState(txn.counterAccountId ?? "");
  const [operationDate, setOperationDate] = useState(localDateTimeValue(new Date(txn.operationDate)));
  const [note, setNote] = useState(txn.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const isDeposit = txn.subType === "DEPOSIT";
  const isTransfer = txn.subType === "FUND_TRANSFER";
  // Reference labels flip with which leg is being edited.
  const accountLabel = isDeposit
    ? txn.type === "DEBIT"
      ? isAr ? "إيداع من" : "Deposit From"
      : isAr ? "إيداع إلى" : "Deposit To"
    : isTransfer
      ? txn.type === "CREDIT"
        ? isAr ? "تحويل إلى" : "Transfer To"
        : isAr ? "تحويل من" : "Transfer From"
      : null;
  const counterLabel = isDeposit
    ? txn.type === "DEBIT"
      ? isAr ? "إيداع إلى" : "Deposit To"
      : isAr ? "إيداع من" : "Deposit From"
    : txn.type === "CREDIT"
      ? isAr ? "تحويل من" : "Transfer From"
      : isAr ? "تحويل إلى" : "Transfer To";
  const title =
    txn.subType === "OPENING_BALANCE"
      ? isAr ? "تعديل الرصيد الافتتاحي" : "Edit Opening Balance"
      : isTransfer
        ? isAr ? "تعديل تحويل الأموال" : "Edit Fund Transfer"
        : isAr ? "تعديل الإيداع" : "Edit Deposit";

  const mutation = useMutation({
    mutationFn: async () =>
      api.put(`/payment-accounts/transactions/${txn.id}`, {
        accountId,
        amount: Number(amount),
        operationDate: new Date(operationDate).toISOString(),
        note: note || null,
        counterAccountId: counterAccountId || null,
      }),
    onSuccess: () => {
      invalidateAccounts(qc);
      onClose();
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={() => mutation.mutate()} disabled={!(Number(amount) > 0) || !operationDate || mutation.isPending}>
            {mutation.isPending ? "…" : isAr ? "إرسال" : "Submit"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          <b>{isAr ? "الحساب المحدد" : "Selected Account"}</b>: {txn.paymentAccount.name}
        </p>
        {accountLabel && (
          <div>
            <label className={labelClass}>{accountLabel}:</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectClass}>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={labelClass}>{isAr ? "المبلغ" : "Amount"}:*</label>
          <IconInput icon={Banknote} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="ltr-nums" />
        </div>
        {(isDeposit || isTransfer) && txn.counterAccountId && (
          <div>
            <label className={labelClass}>{counterLabel}:</label>
            <select value={counterAccountId} onChange={(e) => setCounterAccountId(e.target.value)} className={selectClass}>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={labelClass}>{isAr ? "التاريخ" : "Date"}:*</label>
          <IconInput icon={CalendarDays} type="datetime-local" value={operationDate} onChange={(e) => setOperationDate(e.target.value)} className="ltr-nums" />
        </div>
        {(isDeposit || isTransfer) && (
          <div>
            <label className={labelClass}>{isAr ? "ملاحظة" : "Note"}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className={textareaClass} />
          </div>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}

