import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";

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

  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => (await api.get<ApiSuccess<RoleRow[]>>("/roles")).data.data,
  });

  const { data: permissions } = useQuery({
    queryKey: ["permissions"],
    queryFn: async () => (await api.get<ApiSuccess<Permission[]>>("/permissions")).data.data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "الأدوار" : "Roles"}</h1>
        <button
          onClick={() => {
            setEditingId(null);
            setFormOpen(true);
          }}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          + {isAr ? "دور جديد" : "Add Role"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "الاسم" : "Name"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الوصف" : "Description"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "المستخدمون" : "Users"}</th>
              <th className="px-4 py-2 text-start"></th>
              <th className="px-4 py-2 text-end">{isAr ? "إجراءات" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {roles?.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="px-4 py-2 font-medium">{isAr ? r.nameAr : r.nameEn}</td>
                <td className="px-4 py-2 text-slate-500">{r.description ?? "-"}</td>
                <td className="px-4 py-2"><span className="ltr-nums">{r._count.users}</span></td>
                <td className="px-4 py-2">
                  {r.isSystem && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{isAr ? "نظام" : "System"}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-end">
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setEditingId(r.id);
                        setFormOpen(true);
                      }}
                      className="text-xs font-medium text-sky-700 hover:underline"
                    >
                      {isAr ? "تعديل" : "Edit"}
                    </button>
                    {!r.isSystem && (
                      <button
                        onClick={() => {
                          if (window.confirm(isAr ? "حذف هذا الدور؟" : "Delete this role?")) deleteMutation.mutate(r.id);
                        }}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        {isAr ? "حذف" : "Delete"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {roles?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {isAr ? "لا توجد نتائج" : "No results"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">
            {roleId ? (isAr ? "تعديل الدور" : "Edit Role") : isAr ? "دور جديد" : "New Role"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {isFetching ? (
          <p className="text-sm text-slate-400">{isAr ? "جارٍ التحميل..." : "Loading..."}</p>
        ) : (
          <>
            {isSystem && (
              <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {isAr ? "لا يمكن تعديل الأدوار الأساسية في النظام." : "System roles cannot be modified."}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</label>
                <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} disabled={isSystem} className={inp} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</label>
                <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" disabled={isSystem} className={inp} />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الوصف" : "Description"}</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={isSystem} className={inp} />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-medium text-slate-600">{isAr ? "الصلاحيات" : "Permissions"}</label>
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

            {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            {!isSystem && (
              <button
                onClick={() => {
                  setError(null);
                  mutation.mutate();
                }}
                disabled={!canSubmit || mutation.isPending}
                className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
