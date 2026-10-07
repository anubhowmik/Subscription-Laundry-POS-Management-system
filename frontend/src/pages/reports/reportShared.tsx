import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrentApp } from "../../components/layout/Sidebar";
import { cn } from "../../lib/cn";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { ColumnVisibilityMenu, FiltersMenu, PageSizeSelect, TableExportButtons } from "../../components/ui/TableToolbarControls";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { MultiSelectDropdown } from "../../components/ui/MultiSelectDropdown";
import { DateRangeFilter, initialDateRange, type DateRangeValue } from "../../components/ui/DateRangeFilter";
import { inputClass, selectClass } from "../../components/ui/formClasses";

/**
 * Shared frame for every page under the reference's Reports dropdown (report.js): Location Group /
 * Business Location / Date Range filters plus per-report extras, shown in exactly the Sales A/R
 * list design (see ReportDataTable).
 */

export type Named = { nameEn: string; nameAr: string | null };

export interface ReportOptions {
  locationGroups: ({ id: string } & Named)[];
  locations: { id: string; branchName: string; branchNameAr: string | null; branchCode: string; groupId: string | null }[];
  customerGroups: ({ id: string } & Named)[];
  users: { id: string; fullNameEn: string; fullNameAr: string | null }[];
  /** Product + service categories, keyed "pc:<id>" / "sc:<id>". */
  categories: ({ key: string } & Named)[];
  /** Products + services, keyed "p:<id>" / "s:<id>"; `code` is the SKU / service code. */
  items: ({ key: string; code: string; categoryKey: string | null } & Named)[];
}

export interface ReportLocationFilters {
  locationGroup: Named | null;
  locations: { branchName: string; branchNameAr: string | null; branchCode: string }[] | null;
}

export const pickName = (x: Named, isAr: boolean) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
export const branchLabel = (l: { branchName: string; branchNameAr: string | null; branchCode: string }, isAr: boolean) =>
  `${isAr ? l.branchNameAr || l.branchName : l.branchName} (${l.branchCode})`;

export const num = (v: string | number) => (
  <span className="ltr-nums">{Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
);

export function useReportOptions() {
  return useQuery({
    queryKey: ["reports", "options"],
    queryFn: async () => (await api.get<ApiSuccess<ReportOptions>>("/reports/options")).data.data,
    // Branches / groups / categories / items barely change; don't refetch on every report page.
    staleTime: 5 * 60 * 1000,
  });
}

export function useReportOrgSettings() {
  const { user } = useAuth();
  const org = user?.organization as { fiscalYearStartMonth?: number } | undefined;
  return { fiscalYearStartMonth: org?.fiscalYearStartMonth ?? 1 };
}

/** Location Group + Business Location + Date Range - the filters every report shares. */
export interface BaseReportFilters {
  locationGroupId: string;
  locationIds: string[];
  range: DateRangeValue;
}

export function initialBaseFilters(fiscalYearStartMonth: number): BaseReportFilters {
  return { locationGroupId: "", locationIds: [], range: initialDateRange("today", fiscalYearStartMonth) };
}

export function baseFilterParams(f: BaseReportFilters) {
  return {
    ...(f.locationGroupId ? { locationGroupId: f.locationGroupId } : {}),
    ...(f.locationIds.length > 0 ? { locationIds: f.locationIds.join(",") } : {}),
    from: f.range.from,
    to: f.range.to,
  };
}

export function baseActiveCount(f: BaseReportFilters) {
  return (f.locationGroupId ? 1 : 0) + (f.locationIds.length > 0 ? 1 : 0) + (f.range.preset !== "today" ? 1 : 0);
}

/** Sales A/R's filter-field look: small label over a full-width control. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

export function BaseFilterFields({
  value,
  onChange,
  options,
  isAr,
  fiscalYearStartMonth,
  singleLocation = false,
  hideLocation = false,
  locationAllLabel,
  afterLocation,
  beforeGroup,
  hideDateRange = false,
}: {
  value: BaseReportFilters;
  onChange: (v: BaseReportFilters) => void;
  options: ReportOptions | undefined;
  isAr: boolean;
  fiscalYearStartMonth: number;
  /** The reference's detailed reports take one `location_id`, not the multi-select `location_ids[]`. */
  singleLocation?: boolean;
  /** Reports whose reference filter has only Location Group (no Business Location picker). */
  hideLocation?: boolean;
  /** Text of the Business Location "all" option (the Tax Report's reference says "All locations"). */
  locationAllLabel?: string;
  /** Report-specific fields the reference places between Business Location and Date Range. */
  afterLocation?: ReactNode;
  /** Fields the reference places before Location Group (e.g. the Daily Sales Report's single Date). */
  beforeGroup?: ReactNode;
  /** Reports filtered by a single date rather than a range. */
  hideDateRange?: boolean;
}) {
  // Reference (report.js): picking a Location Group narrows the Business Location list to it.
  const locationOptions = (options?.locations ?? [])
    .filter((l) => !value.locationGroupId || l.groupId === value.locationGroupId)
    .map((l) => ({ value: l.id, label: branchLabel(l, isAr) }));
  return (
    <>
      {beforeGroup}
      <FilterField label={isAr ? "مجموعات الفروع" : "Location Group"}>
        <select
          value={value.locationGroupId}
          onChange={(e) => {
            const next = e.target.value;
            const inGroup = new Set((options?.locations ?? []).filter((l) => !next || l.groupId === next).map((l) => l.id));
            onChange({ ...value, locationGroupId: next, locationIds: value.locationIds.filter((id) => inGroup.has(id)) });
          }}
          className={cn(selectClass, "w-full")}
        >
          <option value="">{isAr ? "الكل" : "All"}</option>
          {(options?.locationGroups ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {pickName(g, isAr)}
            </option>
          ))}
        </select>
      </FilterField>
      {!hideLocation && (
      <FilterField label={isAr ? "موقع العمل" : "Business Location"}>
        {singleLocation ? (
          <select
            value={value.locationIds[0] ?? ""}
            onChange={(e) => onChange({ ...value, locationIds: e.target.value ? [e.target.value] : [] })}
            className={cn(selectClass, "w-full")}
          >
            <option value="">{locationAllLabel ?? (isAr ? "الكل" : "All")}</option>
            {locationOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <MultiSelectDropdown
            options={locationOptions}
            value={value.locationIds}
            onChange={(locationIds) => onChange({ ...value, locationIds })}
            placeholder={isAr ? "الكل" : "All"}
            isAr={isAr}
            inline
          />
        )}
      </FilterField>
      )}
      {afterLocation}
      {!hideDateRange && (
        <FilterField label={isAr ? "نطاق التاريخ" : "Date Range"}>
          <DateRangeFilter value={value.range} onChange={(range) => onChange({ ...value, range })} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} />
        </FilterField>
      )}
    </>
  );
}

/** One report column: how it renders on screen and what the Export menu writes for it. */
export interface ReportColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  exportValue: (row: T) => string | number | null;
  /** This column's cell in the totals row (the reference's DataTables footer); omit for blank. */
  total?: { render: ReactNode; exportValue: string | number | null };
  /** Screen-only column (row actions) - left out of Excel / PDF / Print. */
  noExport?: boolean;
}

/**
 * Every report's table, built from exactly the pieces Sales A/R uses (TableContainer > TableToolbar
 * with Search / Filters / Show page-size / Column visibility / Export, then Table/THead/Th rows and
 * Pagination below) so all report pages look the same as Sales A/R. Filters apply as they change,
 * like Sales A/R. Search, paging and column visibility are client-side over the report's rows
 * (the reference's DataTables); the totals row always covers every row, as the reference's footer does.
 */
export function ReportDataTable<T>({
  storageKey,
  title,
  columns,
  rows,
  rowKey,
  isLoading,
  isAr,
  filters,
  activeFilterCount,
  onClearFilters,
  above,
}: {
  storageKey: string;
  title: string;
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading: boolean;
  isAr: boolean;
  filters: ReactNode;
  activeFilterCount: number;
  onClearFilters: () => void;
  /** Rendered between the toolbar and the table (e.g. the Daily report's tabs). */
  above?: ReactNode;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  // New data (a filter changed) starts again from the first page. Compared by row keys, not array
  // identity - several pages rebuild their rows array on every render.
  const rowsSignature = rows.map(rowKey).join("|");
  const [lastSignature, setLastSignature] = useState(rowsSignature);
  if (lastSignature !== rowsSignature) {
    setLastSignature(rowsSignature);
    setPage(1);
  }
  const columnVisibility = useColumnVisibility(`report:${storageKey}`, columns.map((c) => c.key));
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));
  const exportColumns = visibleColumns.filter((c) => !c.noExport);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => columns.some((c) => String(c.exportValue(r) ?? "").toLowerCase().includes(q)));
  }, [rows, columns, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * limit, current * limit);
  const hasTotals = columns.some((c) => c.total);
  const totalLabel = isAr ? "المجموع" : "Total";

  return (
    <>
      <TableContainer>
        <TableToolbar>
          <SearchInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("common.search")}
            className="max-w-xs"
          />
          <FiltersMenu activeCount={activeFilterCount} onClear={onClearFilters} isAr={isAr}>
            {filters}
          </FiltersMenu>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect
              value={limit}
              onChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
            />
            <ColumnVisibilityMenu columns={columns.map((c) => ({ key: c.key, label: c.label }))} isVisible={columnVisibility.isVisible} onToggle={columnVisibility.toggle} isAr={isAr} />
            <TableExportButtons
              title={title}
              columns={exportColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => [
                ...filtered.map((r) => Object.fromEntries(exportColumns.map((c) => [c.key, c.exportValue(r)]))),
                ...(hasTotals ? [Object.fromEntries(exportColumns.map((c, i) => [c.key, c.total ? c.total.exportValue : i === 0 ? totalLabel : ""]))] : []),
              ]}
              isAr={isAr}
            />
          </div>
        </TableToolbar>
        {above}
        <TableScroll>
          <Table>
            <THead>
              <tr>
                {visibleColumns.map((c) => (
                  <Th key={c.key} className="whitespace-nowrap">
                    {c.label}
                  </Th>
                ))}
              </tr>
            </THead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={rowKey(r)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {visibleColumns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={Math.max(visibleColumns.length, 1)} className="px-4 py-8 text-center text-slate-400">
                    {isLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {isAr ? "جارٍ إنشاء التقرير..." : "Generating report..."}
                      </span>
                    ) : (
                      emptyReportText(isAr)
                    )}
                  </td>
                </tr>
              )}
              {hasTotals && pageRows.length > 0 && (
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  {visibleColumns.map((c, i) => (
                    <td key={c.key} className="px-4 py-3">
                      {c.total ? c.total.render : i === 0 ? totalLabel : null}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </Table>
        </TableScroll>
      </TableContainer>
      {totalPages > 1 && (
        <Pagination
          page={current}
          totalPages={totalPages}
          onPrev={() => setPage(current - 1)}
          onNext={() => setPage(current + 1)}
          label={`${t("common.page")} ${current} ${t("common.of")} ${totalPages}`}
        />
      )}
    </>
  );
}

export const emptyReportText = (isAr: boolean) => (isAr ? "تأكد من عوامل التصفية." : "Make sure of your filters.");

/** An amount column's screen + export + total triple, from a 2-decimal string field. */
export function amountColumn<T>(key: string, label: string, get: (r: T) => string, total?: string | null): ReportColumn<T> {
  return {
    key,
    label,
    render: (r) => num(get(r)),
    exportValue: (r) => exportAmount(get(r)),
    ...(total !== undefined && total !== null ? { total: { render: num(total), exportValue: exportAmount(total) } } : {}),
  };
}

/** The reference's Customer Group select ("Please Select" = no group filter). */
export function CustomerGroupField({ value, onChange, options, isAr, allLabel }: { value: string; onChange: (v: string) => void; options: ReportOptions | undefined; isAr: boolean; allLabel?: string }) {
  return (
    <FilterField label={isAr ? "مجموعة العملاء" : "Customer Group"}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(selectClass, "w-full")}>
        <option value="">{allLabel ?? (isAr ? "يرجى الاختيار" : "Please Select")}</option>
        {(options?.customerGroups ?? []).map((g) => (
          <option key={g.id} value={g.id}>
            {pickName(g, isAr)}
          </option>
        ))}
      </select>
    </FilterField>
  );
}

/** Category select + multi Product picker (reference: picked products win over the category). */
export function ItemFilterFields({
  categoryId,
  itemIds,
  onChange,
  options,
  isAr,
}: {
  categoryId: string;
  itemIds: string[];
  onChange: (v: { categoryId: string; itemIds: string[] }) => void;
  options: ReportOptions | undefined;
  isAr: boolean;
}) {
  const scope = useReportAppScope();
  return (
    <>
      <FilterField label={isAr ? "الفئة" : "Category"}>
        <select value={categoryId} onChange={(e) => onChange({ categoryId: e.target.value, itemIds })} className={cn(selectClass, "w-full")}>
          <option value="">{isAr ? "الكل" : "All"}</option>
          {(options?.categories ?? []).filter((c) => keyInScope(scope, c.key)).map((c) => (
            <option key={c.key} value={c.key}>
              {pickName(c, isAr)}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label={isAr ? "المنتج" : "Product"}>
        <MultiSelectDropdown
          options={(options?.items ?? []).filter((i) => keyInScope(scope, i.key)).map((i) => ({ value: i.key, label: `${pickName(i, isAr)} (${i.code})` }))}
          value={itemIds}
          onChange={(v) => onChange({ categoryId, itemIds: v })}
          placeholder={isAr ? "الكل" : "All"}
          isAr={isAr}
          inline
        />
      </FilterField>
    </>
  );
}

/** Customer Group / Category / Product parts of the printed filters line. */
export function itemFiltersText(f: { customerGroup?: Named | null; category?: Named | null; items?: Named[] | null }, isAr: boolean) {
  return [
    f.customerGroup ? `${isAr ? "مجموعة العملاء" : "Customer Group"}: ${pickName(f.customerGroup, isAr)}` : "",
    f.category ? `${isAr ? "الفئة" : "Category"}: ${pickName(f.category, isAr)}` : "",
    f.items ? `${isAr ? "المنتج" : "Product"}: ${f.items.map((i) => pickName(i, isAr)).join(", ")}` : "",
  ].filter(Boolean);
}

/** Plain 2-decimal text for exported amounts (the Export menu writes cell text as-is). */
export const exportAmount = (v: string | number) => Number(v).toFixed(2);

export type PickedCustomer = { id: string; nameEn: string; nameAr: string | null; phone: string };

/** The reference's "Contact" filter (customer name / phone search) - Sales A/R's Customer picker. */
export function ContactFilterField({ value, onChange, isAr }: { value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void; isAr: boolean }) {
  const [search, setSearch] = useState("");
  const { data: results } = useQuery({
    queryKey: ["reports", "customer-search", search],
    queryFn: async () => (await api.get<ApiSuccess<PickedCustomer[]>>("/reports/customer-search", { params: { search } })).data.data,
    enabled: search.trim().length > 0 && !value,
  });
  return (
    <div>
      <FilterField label={isAr ? "جهة الاتصال" : "Contact"}>
        <input
          value={value ? `${pickName(value, isAr)} / ${value.phone}` : search}
          onChange={(e) => {
            onChange(null);
            setSearch(e.target.value);
          }}
          placeholder={isAr ? "أدخل اسم العميل / الهاتف" : "Enter Customer name / phone"}
          className={cn(inputClass, "w-full")}
        />
      </FilterField>
      {search && !value && (results?.length ?? 0) > 0 && (
        // In flow, not floating: inside the scrolling Filters popover an absolute list gets clipped.
        <div className="mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {results!.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c);
                setSearch("");
              }}
              className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
            >
              {pickName(c, isAr)} <span className="ltr-nums text-xs text-slate-400">({c.phone})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Service POS and Product POS are separate apps: a report opened inside one of them covers only
 * that app's sales (the backend scopes on `app`). POS Laundry - or no app at all - sees everything.
 */
export type ReportAppScope = "service" | "product" | undefined;

export function useReportAppScope(): ReportAppScope {
  const key = useCurrentApp()?.key;
  return key === "posService" ? "service" : key === "posProduct" ? "product" : undefined;
}

/** The `app` query param for a scope (nothing for POS Laundry). */
export const scopeParams = (scope: ReportAppScope) => (scope ? { app: scope } : {});

/** Whether a picker option keyed "pc:"/"sc:"/"p:"/"s:" belongs to the current app. */
export function keyInScope(scope: ReportAppScope, key: string) {
  if (!scope) return true;
  const isService = key.startsWith("sc:") || key.startsWith("s:");
  return scope === "service" ? isService : !isService;
}
