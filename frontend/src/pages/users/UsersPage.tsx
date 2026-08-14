import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, BusinessLocation, Customer, CustomerGroup } from "../../types/api";
import { useAuth } from "../../contexts/AuthContext";

interface Role {
  id: string;
  nameEn: string;
  nameAr: string;
}

interface UserRow {
  id: string;
  username: string | null;
  email: string | null;
  fullNameEn: string;
  status: "ACTIVE" | "INACTIVE";
  isSystemAdmin: boolean;
  allowLogin: boolean;
  role: Role;
}

// react-hook-form keeps a registered-but-unmounted field's value at "" rather than undefined (the
// username/email/password inputs unmount when "Can log in" is off) - preprocess "" to undefined
// first so z.optional() actually takes effect instead of running "" through .min()/.email().
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const createSchema = z
  .object({
    username: z.preprocess(emptyToUndefined, z.string().min(3, "Min 3 characters").optional()),
    email: z.preprocess(emptyToUndefined, z.string().email().optional()),
    password: z.preprocess(emptyToUndefined, z.string().min(8, "Min 8 characters").optional()),
    fullNameEn: z.string().min(1, "Required"),
    roleId: z.string().uuid("Select a role"),
    businessLocationIds: z.array(z.string().uuid()),
    isSystemAdmin: z.boolean().optional(),
    allowLogin: z.boolean(),
    // z.coerce.number() on "" would silently become 0 (Number("") === 0) before z.literal("")
    // ever gets a chance to match - preprocess "" to undefined first, same as above.
    maxDiscountPercent: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(100).optional()),
    customerIds: z.array(z.string().uuid()),
    customerGroupIds: z.array(z.string().uuid()),
    transferFromLocationIds: z.array(z.string().uuid()),
  })
  .refine((v) => !v.allowLogin || Boolean(v.username && v.email && v.password), {
    message: "Username, email, and password are required when login is allowed",
    path: ["password"],
  });
type CreateFormValues = z.infer<typeof createSchema>;

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Min 8 characters"),
});
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export default function UsersPage() {
  const { t, i18n } = useTranslation();
  const { user: currentUser, can } = useAuth();
  const isAr = i18n.resolvedLanguage === "ar";
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<ApiSuccess<UserRow[]>>("/users", { params: { limit: 50 } })).data.data,
  });

  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => (await api.get<ApiSuccess<Role[]>>("/roles")).data.data,
  });

  const { data: locations } = useQuery({
    queryKey: ["all-business-locations"],
    queryFn: async () => (await api.get<ApiSuccess<BusinessLocation[]>>("/business-locations", { params: { limit: 100 } })).data.data,
    enabled: showForm,
  });

  const { data: customers } = useQuery({
    queryKey: ["all-customers"],
    queryFn: async () => (await api.get<ApiSuccess<Customer[]>>("/customers", { params: { limit: 100 } })).data.data,
    enabled: showForm,
  });

  const { data: customerGroups } = useQuery({
    queryKey: ["all-customer-groups"],
    queryFn: async () => (await api.get<ApiSuccess<CustomerGroup[]>>("/customer-groups", { params: { limit: 100 } })).data.data,
    enabled: showForm,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      businessLocationIds: [],
      isSystemAdmin: false,
      allowLogin: true,
      customerIds: [],
      customerGroupIds: [],
      transferFromLocationIds: [],
    },
  });
  const selectedLocationIds = watch("businessLocationIds") ?? [];
  const selectedCustomerIds = watch("customerIds") ?? [];
  const selectedCustomerGroupIds = watch("customerGroupIds") ?? [];
  const selectedTransferFromLocationIds = watch("transferFromLocationIds") ?? [];
  const grantSystemAdmin = watch("isSystemAdmin");
  const allowLogin = watch("allowLogin");

  const createMutation = useMutation({
    mutationFn: async (values: CreateFormValues) => (await api.post("/users", values)).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      reset();
      setServerError(null);
    },
    onError: (err) => {
      setServerError(isAxiosError(err) ? err.response?.data?.message ?? t("common.somethingWentWrong") : t("common.somethingWentWrong"));
    },
  });

  const {
    register: registerReset,
    handleSubmit: handleResetSubmit,
    reset: resetResetForm,
    formState: { errors: resetErrors, isSubmitting: isResetting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      api.post(`/users/${userId}/reset-password`, { newPassword }),
    onSuccess: () => {
      setResetSuccess(true);
      setResetError(null);
      resetResetForm();
    },
    onError: (err) => {
      setResetError(isAxiosError(err) ? err.response?.data?.message ?? t("common.somethingWentWrong") : t("common.somethingWentWrong"));
    },
  });

  function toggleLocation(id: string) {
    const next = selectedLocationIds.includes(id)
      ? selectedLocationIds.filter((l) => l !== id)
      : [...selectedLocationIds, id];
    setValue("businessLocationIds", next);
  }

  function toggleInArray(field: "customerIds" | "customerGroupIds" | "transferFromLocationIds", current: string[], id: string) {
    const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
    setValue(field, next);
  }

  function closeResetModal() {
    setResetTarget(null);
    setResetError(null);
    setResetSuccess(false);
    resetResetForm();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{t("nav.users")}</h1>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          + {t("common.add")}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">Username</th>
              <th className="px-4 py-2 text-start">{t("common.name")}</th>
              <th className="px-4 py-2 text-start">{t("common.email")}</th>
              <th className="px-4 py-2 text-start">Role</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="px-4 py-2">
                  {u.username ?? <span className="text-slate-400">—</span>}
                  {u.isSystemAdmin && (
                    <span className="ms-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">System Admin</span>
                  )}
                  {!u.allowLogin && (
                    <span className="ms-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">No login</span>
                  )}
                </td>
                <td className="px-4 py-2">{u.fullNameEn}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{isAr ? u.role.nameAr : u.role.nameEn}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${u.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {u.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {can("users.reset_password") && (
                    <button onClick={() => setResetTarget(u)} className="text-xs font-medium text-sky-700 hover:underline">
                      Reset password
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">{t("common.add")}</h2>
            <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register("allowLogin")} />
                Can log in (off = a staff record for reference only, e.g. as a technician on tickets)
              </label>

              {allowLogin && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
                    <input {...register("username")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                    {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">{t("common.email")}</label>
                    <input {...register("email")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                    {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth.password")}</label>
                    <input type="password" {...register("password")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                    {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
                  </div>
                </>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("common.name")}</label>
                <input {...register("fullNameEn")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                {errors.fullNameEn && <p className="mt-1 text-xs text-red-600">{errors.fullNameEn.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Max discount % (blank = unlimited)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  {...register("maxDiscountPercent")}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                {errors.maxDiscountPercent && <p className="mt-1 text-xs text-red-600">{errors.maxDiscountPercent.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
                <select {...register("roleId")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="">-</option>
                  {roles?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {isAr ? r.nameAr : r.nameEn}
                    </option>
                  ))}
                </select>
                {errors.roleId && <p className="mt-1 text-xs text-red-600">{errors.roleId.message}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Business Locations</label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                  {locations?.map((loc) => (
                    <label key={loc.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedLocationIds.includes(loc.id)}
                        onChange={() => toggleLocation(loc.id)}
                        disabled={grantSystemAdmin}
                      />
                      {loc.branchName}
                    </label>
                  ))}
                </div>
                {!grantSystemAdmin && selectedLocationIds.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    No locations selected — this user won&apos;t be able to use POS or view location-scoped data.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Restrict to Customers (blank = unrestricted)</label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                  {customers?.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedCustomerIds.includes(c.id)}
                        onChange={() => toggleInArray("customerIds", selectedCustomerIds, c.id)}
                      />
                      {c.nameEn}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Restrict to Customer Groups (blank = unrestricted)</label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                  {customerGroups?.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedCustomerGroupIds.includes(g.id)}
                        onChange={() => toggleInArray("customerGroupIds", selectedCustomerGroupIds, g.id)}
                      />
                      {g.nameEn}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Can Transfer Stock From (blank = unrestricted)</label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                  {locations?.map((loc) => (
                    <label key={loc.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedTransferFromLocationIds.includes(loc.id)}
                        onChange={() => toggleInArray("transferFromLocationIds", selectedTransferFromLocationIds, loc.id)}
                      />
                      {loc.branchName}
                    </label>
                  ))}
                </div>
              </div>

              {currentUser?.isSystemAdmin && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...register("isSystemAdmin")} />
                  Grant System Admin (full access to all locations and permissions)
                </label>
              )}

              {serverError && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{serverError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    reset();
                    setServerError(null);
                  }}
                  className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-slate-800">Reset password</h2>
            <p className="mb-4 text-sm text-slate-500">for {resetTarget.username}</p>

            {resetSuccess ? (
              <>
                <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Password reset successfully.</p>
                <button onClick={closeResetModal} className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
                  {t("common.close")}
                </button>
              </>
            ) : (
              <form
                onSubmit={handleResetSubmit((v) => resetPasswordMutation.mutate({ userId: resetTarget.id, newPassword: v.newPassword }))}
                className="space-y-3"
              >
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
                  <input type="password" {...registerReset("newPassword")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  {resetErrors.newPassword && <p className="mt-1 text-xs text-red-600">{resetErrors.newPassword.message}</p>}
                </div>
                {resetError && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{resetError}</p>}
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={closeResetModal} className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isResetting}
                    className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                  >
                    {t("common.confirm")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
