import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Eye, XCircle } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { RowActionButton, RowActionLink, RowActions } from "../../components/ui/Table";
import { selectClass } from "../../components/ui/formClasses";
import { errorMessage } from "../paymentAccounts/shared";
import {
  useReportAppScope,
  scopeParams,
  BaseFilterFields,
  FilterField,
  ReportDataTable,
  baseActiveCount,
  baseFilterParams,
  branchLabel,
  exportAmount,
  initialBaseFilters,
  num,
  pickName,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type Named,
  type ReportColumn,
  type ReportLocationFilters,
} from "./reportShared";

type MethodCell = { amount: string; count: number };
type UserName = { fullNameEn: string; fullNameAr: string | null };
interface Row {
  id: string;
  openTime: string;
  closeTime: string | null;
  status: "OPEN" | "CLOSED";
  location: { branchName: string; branchNameAr: string | null; branchCode: string };
  user: UserName & { email: string | null };
  closedBy: UserName | null;
  methods: Record<string, MethodCell>;
  total: string;
  salesCount: number;
  openingCash: string;
  expectedCash: string | null;
  countedCash: string | null;
  cashDifference: string | null;
  notes: string | null;
}
interface ReportData {
  startDate: string;
  endDate: string;
  filters: ReportLocationFilters;
  paymentMethods: (Named & { id: string; code: string })[];
  rows: Row[];
  totals: { methods: Record<string, MethodCell>; total: string };
}
interface Filters extends BaseReportFilters {
  userId: string;
  status: "" | "open" | "close";
}

/** Card and cheque columns also show their slip / cheque count, as the reference does. */
const COUNTED = new Set(["CARD", "CHEQUE"]);

const params = (f: Filters) => ({ ...baseFilterParams(f), ...(f.userId ? { userId: f.userId } : {}), ...(f.status ? { status: f.status } : {}) });

/** Reference: Reports > Register Report (report/register_report.blade.php). */
export default function RegisterReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { can } = useAuth();
  const canManageRegisters = can("pos.register.manage");
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), userId: "", status: "" });
  const [filters, setFilters] = useState<Filters>(initial);
  const [viewing, setViewing] = useState<Row | null>(null);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "register", params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/register", { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const userName = (u: UserName) => (isAr ? u.fullNameAr || u.fullNameEn : u.fullNameEn);
  const methodText = (code: string, m: MethodCell) => (COUNTED.has(code) ? `${exportAmount(m.amount)} (${m.count})` : exportAmount(m.amount));
  const methodNode = (code: string, m: MethodCell) => (
    <span className="whitespace-nowrap">
      {num(m.amount)}
      {COUNTED.has(code) && <span className="ltr-nums text-slate-400"> ({m.count})</span>}
    </span>
  );
  const t = report?.totals;
  const columns: ReportColumn<Row>[] = [
    { key: "openTime", label: isAr ? "وقت البداية" : "Open Time", render: (r) => <span className="ltr-nums whitespace-nowrap">{r.openTime}</span>, exportValue: (r) => r.openTime },
    { key: "closeTime", label: isAr ? "وقت الانتهاء" : "Close Time", render: (r) => <span className="ltr-nums whitespace-nowrap">{r.closeTime ?? ""}</span>, exportValue: (r) => r.closeTime ?? "" },
    { key: "location", label: isAr ? "الفرع" : "Location", render: (r) => <span className="font-medium text-slate-800">{branchLabel(r.location, isAr)}</span>, exportValue: (r) => branchLabel(r.location, isAr) },
    {
      key: "user",
      label: isAr ? "المستخدم" : "User",
      render: (r) => (
        <>
          <div>{userName(r.user)}</div>
          {r.user.email && <div className="text-xs text-slate-400">{r.user.email}</div>}
        </>
      ),
      exportValue: (r) => `${userName(r.user)}${r.user.email ? ` - ${r.user.email}` : ""}`,
    },
    ...(report?.paymentMethods ?? []).map((m) => ({
      key: `m:${m.id}`,
      label: pickName(m, isAr),
      render: (r: Row) => methodNode(m.code, r.methods[m.id]),
      exportValue: (r: Row) => methodText(m.code, r.methods[m.id]),
      ...(t ? { total: { render: methodNode(m.code, t.methods[m.id]), exportValue: methodText(m.code, t.methods[m.id]) } } : {}),
    })),
    {
      key: "total",
      label: isAr ? "المجموع" : "Total",
      render: (r) => <span className="font-semibold text-slate-800">{num(r.total)}</span>,
      exportValue: (r) => exportAmount(r.total),
      ...(t ? { total: { render: num(t.total), exportValue: exportAmount(t.total) } } : {}),
    },
    {
      key: "action",
      label: isAr ? "خيار" : "Action",
      noExport: true,
      exportValue: () => null,
      render: (r) => (
        <RowActions align="start">
          <RowActionButton icon={Eye} label={isAr ? "عرض" : "View"} onClick={() => setViewing(r)} />
          {r.status === "OPEN" && canManageRegisters && <RowActionLink icon={XCircle} label={isAr ? "إغلاق" : "Close"} variant="danger" to="/register-sessions" />}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير المناوبة" : "Register Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="register"
        title={`${isAr ? "تقرير المناوبة" : "Register Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.id}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters) + (filters.userId ? 1 : 0) + (filters.status ? 1 : 0)}
        onClearFilters={() => setFilters(initial())}
        filters={
          <BaseFilterFields
            value={filters}
            onChange={(v) => setFilters({ ...filters, ...v })}
            options={options}
            isAr={isAr}
            fiscalYearStartMonth={fiscalYearStartMonth}
            singleLocation
            afterLocation={
              <>
                <FilterField label={isAr ? "المستخدم" : "User"}>
                  <select value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })} className={cn(selectClass, "w-full")}>
                    <option value="">{isAr ? "جميع المستخدمين" : "All Users"}</option>
                    {(options?.users ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {userName(u)}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label={isAr ? "الحالة" : "Status"}>
                  <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters["status"] })} className={cn(selectClass, "w-full")}>
                    <option value="">{isAr ? "الكل" : "All"}</option>
                    <option value="open">{isAr ? "مفتوح" : "Open"}</option>
                    <option value="close">{isAr ? "مغلق" : "Close"}</option>
                  </select>
                </FilterField>
              </>
            }
          />
        }
      />
      {viewing && report && (
        <Modal
          title={`${isAr ? "تفاصيل السجل" : "Register Details"} (${viewing.openTime}${viewing.closeTime ? ` - ${viewing.closeTime}` : ""})`}
          subtitle={`${branchLabel(viewing.location, isAr)} · ${userName(viewing.user)}`}
          onClose={() => setViewing(null)}
        >
          <table className="w-full text-sm">
            <tbody>
              {report.paymentMethods
                .filter((m) => Number(viewing.methods[m.id].amount) > 0)
                .map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-600">{pickName(m, isAr)}</td>
                    <td className="py-2 text-end">{methodNode(m.code, viewing.methods[m.id])}</td>
                  </tr>
                ))}
              <tr className="border-b border-slate-200 font-semibold text-slate-800">
                <td className="py-2">{isAr ? "إجمالي المبيعات" : "Total Sales"}</td>
                <td className="py-2 text-end">{num(viewing.total)}</td>
              </tr>
              {(
                [
                  [isAr ? "عدد الفواتير" : "Invoices", <span className="ltr-nums">{viewing.salesCount}</span>],
                  [isAr ? "النقد عند الفتح" : "Cash in hand (opening)", num(viewing.openingCash)],
                  [isAr ? "النقد المتوقع" : "Expected cash", viewing.expectedCash !== null ? num(viewing.expectedCash) : "-"],
                  [isAr ? "النقد المعدود" : "Counted cash", viewing.countedCash !== null ? num(viewing.countedCash) : "-"],
                  [isAr ? "الفرق" : "Difference", viewing.cashDifference !== null ? num(viewing.cashDifference) : "-"],
                  [isAr ? "أغلق بواسطة" : "Closed by", viewing.closedBy ? userName(viewing.closedBy) : "-"],
                  [isAr ? "ملاحظات" : "Notes", viewing.notes ?? "-"],
                ] as const
              ).map(([label, value]) => (
                <tr key={label} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-slate-600">{label}</td>
                  <td className="py-2 text-end">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
