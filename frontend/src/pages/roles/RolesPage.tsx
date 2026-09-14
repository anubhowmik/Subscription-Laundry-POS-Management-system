import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import { confirmAction } from "../../stores/confirmStore";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { LoadingState } from "../../components/ui/Spinner";
import { labelClass, inputClass } from "../../components/ui/formClasses";
import { ShieldCheck, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

interface Permission {
  id: string;
  code: string;
  module: string;
  description: string | null;
}

interface RoleRow {
  id: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  isSystem: boolean;
  _count: { users: number };
}

interface RoleDetail extends RoleRow {
  rolePermissions: { permission: Permission }[];
}

export default function RolesPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  // Sortable column headers - backend already whitelists these fields (role.service.ts's
  // SORTABLE_FIELDS).
  const [sortBy, setSortBy] = useState("nameEn");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    sortBy,
    sortOrder,
  };

  const { data } = useQuery({
    queryKey: ["roles", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<RoleRow[]>>("/roles", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const { data: permissions } = useQuery({
    queryKey: ["permissions"],
    queryFn: async () => (await api.get<ApiSuccess<Permission[]>>("/permissions")).data.data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });

  const columns: { key: string; label: string; sortField?: string; render: (r: RoleRow) => ReactNode; exportValue: (r: RoleRow) => string | number | null }[] = [
    {
      key: "nameEn",
      label: isAr ? "الاسم" : "Name",
      sortField: "nameEn",
      render: (r) => <span className="font-medium">{isAr ? r.nameAr : r.nameEn}</span>,
      exportValue: (r) => (isAr ? r.nameAr : r.nameEn),
    },
    {
      key: "description",
      label: isAr ? "الوصف" : "Description",
      render: (r) => r.description ?? "-",
      exportValue: (r) => r.description,
    },
    {
      key: "users",
      label: isAr ? "المستخدمون" : "Users",
      render: (r) => <span className="ltr-nums">{r._count.users}</span>,
      exportValue: (r) => r._count.users,
    },
    {
      key: "isSystem",
      label: "",
      render: (r) => (r.isSystem ? <Badge variant="neutral">{isAr ? "نظام" : "System"}</Badge> : null),
      exportValue: (r) => (r.isSystem ? (isAr ? "نظام" : "System") : ""),
    },
  ];
  const columnVisibility = useColumnVisibility(
    "roles",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "الأدوار" : "Roles"}
        actions={
          <Button
            onClick={() => {
              setEditingId(null);
              setFormOpen(true);
            }}
          >
            + {isAr ? "دور جديد" : "Add Role"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
        <StatCard
          icon={ShieldCheck}
          cardBg="bg-app-users-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "الأدوار" : "Roles"}
          value={String(data?.meta?.total ?? 0)}
        />
      </div>

      <TableContainer>
        <TableToolbar>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect
              value={limit}
              onChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
            />
            <ColumnVisibilityMenu
              columns={columns.map((c) => ({ key: c.key, label: c.label || (isAr ? "نظام" : "System") }))}
              isVisible={columnVisibility.isVisible}
              onToggle={columnVisibility.toggle}
              isAr={isAr}
            />
            <TableExportButtons
              title={isAr ? "الأدوار" : "Roles"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label || (isAr ? "نظام" : "System") }))}
              getRows={async () => {
                const all = await fetchAllRows<RoleRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<RoleRow[]>>("/roles", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((r) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(r)])));
              }}
              isAr={isAr}
            />
          </div>
        </TableToolbar>
        <TableScroll>
        <Table>
          <THead>
            <tr>
              {visibleColumns.map((c) =>
                c.sortField ? (
                  <SortableTh key={c.key} field={c.sortField} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                    {c.label}
                  </SortableTh>
                ) : (
                  <Th key={c.key}>{c.label}</Th>
                ),
              )}
              <Th>{isAr ? "إجراءات" : "Actions"}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                {visibleColumns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render(r)}
                  </td>
                ))}
                <td className="px-4 py-3 text-end">
                  <RowActions>
                    <RowActionButton
                      icon={Pencil}
                      label={isAr ? "تعديل" : "Edit"}
                      onClick={() => {
                        setEditingId(r.id);
                        setFormOpen(true);
                      }}
                    />
                    {!r.isSystem && (
                      <RowActionButton
                        icon={Trash2}
                        label={isAr ? "حذف" : "Delete"}
                        variant="danger"
                        onClick={async () => {
                          if (await confirmAction({ message: isAr ? "حذف هذا الدور؟" : "Delete this role?", danger: true })) deleteMutation.mutate(r.id);
                        }}
                      />
                    )}
                  </RowActions>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-400">
                  {isAr ? "لا توجد نتائج" : "No results"}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        </TableScroll>
      </TableContainer>

      {data?.meta && data.meta.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={data.meta.totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          label={`${isAr ? "صفحة" : "Page"} ${page} ${isAr ? "من" : "of"} ${data.meta.totalPages}`}
        />
      )}

      {formOpen && (
        <RoleFormModal
          isAr={isAr}
          roleId={editingId}
          permissions={permissions ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["roles"] });
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

function RoleFormModal({
  isAr,
  roleId,
  permissions,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  roleId: string | null;
  permissions: Permission[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: roleDetail, isFetching } = useQuery({
    queryKey: ["role", roleId],
    queryFn: async () => (await api.get<ApiSuccess<RoleDetail>>(`/roles/${roleId}`)).data.data,
    enabled: Boolean(roleId),
  });

  useEffect(() => {
    if (roleDetail) {
      setNameEn(roleDetail.nameEn);
      setNameAr(roleDetail.nameAr);
      setDescription(roleDetail.description ?? "");
      setSelectedCodes(new Set(roleDetail.rolePermissions.map((rp) => rp.permission.code)));
    }
  }, [roleDetail]);

  const isSystem = roleDetail?.isSystem ?? false;

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { nameEn, nameAr, description: description || undefined, permissionCodes: [...selectedCodes] };
      if (roleId) return api.put(`/roles/${roleId}`, payload);
      return api.post("/roles", payload);
    },
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  function toggle(code: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleGroup(codes: string[], selectAll: boolean) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      codes.forEach((c) => (selectAll ? next.add(c) : next.delete(c)));
      return next;
    });
  }

  const canSubmit = nameEn.trim().length > 0 && nameAr.trim().length > 0 && !isSystem;

  return (
    <Modal
      title={roleId ? (isAr ? "تعديل الدور" : "Edit Role") : isAr ? "دور جديد" : "New Role"}
      onClose={onClose}
      size="xl"
    >
      {isFetching ? (
        <LoadingState label={isAr ? "جارٍ التحميل..." : "Loading..."} />
      ) : (
        <>
          {isSystem && (
            <Alert variant="warning" className="mb-3">
              {isAr ? "لا يمكن تعديل الأدوار الأساسية في النظام." : "System roles cannot be modified."}
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</label>
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} disabled={isSystem} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</label>
              <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" disabled={isSystem} className={inputClass} />
            </div>
          </div>
          <div className="mt-3">
            <label className={labelClass}>{isAr ? "الوصف" : "Description"}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={isSystem} className={inputClass} />
          </div>

          <div className="mt-4">
            <label className={labelClass}>{isAr ? "الصلاحيات" : "Permissions"}</label>
            <div className="space-y-3">
              {Object.entries(grouped).map(([module, perms]) => {
                const codes = perms.map((p) => p.code);
                const allSelected = codes.every((c) => selectedCodes.has(c));
                return (
                  <div key={module} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase text-slate-500">{module}</span>
                      <button
                        type="button"
                        disabled={isSystem}
                        onClick={() => toggleGroup(codes, !allSelected)}
                        className="text-xs text-sky-600 hover:underline disabled:opacity-40"
                      >
                        {allSelected ? (isAr ? "إلغاء تحديد الكل" : "Unselect all") : isAr ? "تحديد الكل" : "Select all"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                      {perms.map((p) => (
                        <label key={p.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            disabled={isSystem}
                            checked={selectedCodes.has(p.code)}
                            onChange={() => toggle(p.code)}
                          />
                          <span title={p.description ?? undefined}>{p.code}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

          {!isSystem && (
            <Button
              fullWidth
              className="mt-4"
              onClick={() => {
                setError(null);
                mutation.mutate();
              }}
              disabled={!canSubmit || mutation.isPending}
            >
              {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
            </Button>
          )}
        </>
      )}
    </Modal>
  );
}

