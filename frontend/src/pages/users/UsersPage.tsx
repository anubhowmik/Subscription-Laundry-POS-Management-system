import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, BusinessLocation, Customer, CustomerGroup } from "../../types/api";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th } from "../../components/ui/Table";
import { labelClass, inputClass, selectClass, errorTextClass } from "../../components/ui/formClasses";
import { Users, UserCheck, KeyRound, Ticket } from "lucide-react";

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
  const navigate = useNavigate();
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

  // Informational only (unlike branches, not every user counts - a non-login reference-only
  // account never does), so this never disables "+ Add"; the actual gate is server-side and
  // surfaces through serverError only when someone tries to add/reactivate a login-capable user
  // past the limit. See user.service.ts's assertUserSeatAvailable(), which compares against
  // Organization.purchasedUserSeats (one-time $10-per-seat purchases, see /licenses) rather than
  // a plan tier's maxUsers - there's only a single Plan now, see config/plans.ts.
  const { data: seatSummary } = useQuery({
    queryKey: ["billing-seats-summary"],
    queryFn: async () =>
      (await api.get<ApiSuccess<{ purchasedUserSeats: number; usedUserSeats: number; availableUserSeats: number }>>("/billing/seats")).data.data,
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
  } = useForm<z.input<typeof createSchema>, unknown, CreateFormValues>({
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
    <div className="space-y-6">
      <PageHeader
        title={t("nav.users")}
        actions={
          <Button onClick={() => setShowForm(true)}>
            + {t("common.add")}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Users}
          cardBg="bg-app-users-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={t("nav.users")}
          value={String(users?.length ?? 0)}
        />
        <StatCard
          icon={UserCheck}
          cardBg="bg-emerald-50"
          iconBg="bg-emerald-500"
          iconColor="text-white"
          label={isAr ? "المستخدمون النشطون" : "Active Users"}
          value={String(users?.filter((u) => u.status === "ACTIVE").length ?? 0)}
        />
        {seatSummary && (
          <>
            <StatCard
              icon={KeyRound}
              cardBg="bg-sky-50"
              iconBg="bg-sky-500"
              iconColor="text-white"
              label={isAr ? "المقاعد المشتراة" : "Purchased Seats"}
              value={String(seatSummary.purchasedUserSeats)}
            />
            <StatCard
              icon={Ticket}
              cardBg="bg-amber-50"
              iconBg="bg-amber-500"
              iconColor="text-white"
              label={isAr ? "المقاعد المتاحة" : "Available Seats"}
              value={String(seatSummary.availableUserSeats)}
              warn={seatSummary.availableUserSeats === 0}
            />
          </>
        )}
      </div>

      {seatSummary && (
        <Alert variant={seatSummary.availableUserSeats === 0 ? "warning" : "info"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="ltr-nums">
              Using {seatSummary.usedUserSeats} of {seatSummary.purchasedUserSeats} purchased user seat
              {seatSummary.purchasedUserSeats === 1 ? "" : "s"}.
            </span>
            <Button size="sm" variant="outline" onClick={() => navigate("/licenses")}>
              Buy more seats
            </Button>
          </div>
        </Alert>
      )}

      <TableContainer>
        <Table>
          <THead>
            <tr>
              <Th>Username</Th>
              <Th>{t("common.name")}</Th>
              <Th>{t("common.email")}</Th>
              <Th>Role</Th>
              <Th>{t("common.status")}</Th>
              <Th>{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  {u.username ?? <span className="text-slate-400">—</span>}
                  {u.isSystemAdmin && (
                    <Badge variant="info" className="ms-2">System Admin</Badge>
                  )}
                  {!u.allowLogin && (
                    <Badge variant="neutral" className="ms-2">No login</Badge>
                  )}
                </td>
                <td className="px-4 py-3">{u.fullNameEn}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{isAr ? u.role.nameAr : u.role.nameEn}</td>
                <td className="px-4 py-3">
                  <Badge variant={u.status === "ACTIVE" ? "success" : "neutral"}>
                    {u.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {can("users.reset_password") && (
                    <button
                      onClick={() => setResetTarget(u)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100"
                    >
                      Reset password
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableContainer>

      {showForm && (
        <Modal
          title={t("common.add")}
          onClose={() => {
            setShowForm(false);
            reset();
            setServerError(null);
          }}
        >
          <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("allowLogin")} />
              Can log in (off = a staff record for reference only, e.g. as a technician on tickets)
            </label>

            {allowLogin && (
              <>
                <div>
                  <label className={labelClass}>Username</label>
                  <input {...register("username")} className={inputClass} />
                  {errors.username && <p className={errorTextClass}>{errors.username.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>{t("common.email")}</label>
                  <input {...register("email")} className={inputClass} />
                  {errors.email && <p className={errorTextClass}>{errors.email.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>{t("auth.password")}</label>
                  <input type="password" {...register("password")} className={inputClass} />
                  {errors.password && <p className={errorTextClass}>{errors.password.message}</p>}
                </div>
              </>
            )}

            <div>
              <label className={labelClass}>{t("common.name")}</label>
              <input {...register("fullNameEn")} className={inputClass} />
              {errors.fullNameEn && <p className={errorTextClass}>{errors.fullNameEn.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Max discount % (blank = unlimited)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                {...register("maxDiscountPercent")}
                className={inputClass}
              />
              {errors.maxDiscountPercent && <p className={errorTextClass}>{errors.maxDiscountPercent.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Role</label>
              <select {...register("roleId")} className={selectClass}>
                <option value="">-</option>
                {roles?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {isAr ? r.nameAr : r.nameEn}
                  </option>
                ))}
              </select>
              {errors.roleId && <p className={errorTextClass}>{errors.roleId.message}</p>}
            </div>

            <div>
              <label className={labelClass}>Business Locations</label>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
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
              <label className={labelClass}>Restrict to Customers (blank = unrestricted)</label>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
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
              <label className={labelClass}>Restrict to Customer Groups (blank = unrestricted)</label>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
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
              <label className={labelClass}>Can Transfer Stock From (blank = unrestricted)</label>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
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

            {serverError && <Alert variant="danger">{serverError}</Alert>}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => {
                  setShowForm(false);
                  reset();
                  setServerError(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" fullWidth disabled={isSubmitting}>
                {t("common.save")}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {resetTarget && (
        <Modal title="Reset password" subtitle={`for ${resetTarget.username}`} onClose={closeResetModal} size="sm">
          {resetSuccess ? (
            <>
              <Alert variant="success">Password reset successfully.</Alert>
              <Button fullWidth className="mt-4" onClick={closeResetModal}>
                {t("common.close")}
              </Button>
            </>
          ) : (
            <form
              onSubmit={handleResetSubmit((v) => resetPasswordMutation.mutate({ userId: resetTarget.id, newPassword: v.newPassword }))}
              className="space-y-4"
            >
              <div>
                <label className={labelClass}>New password</label>
                <input type="password" {...registerReset("newPassword")} className={inputClass} />
                {resetErrors.newPassword && <p className={errorTextClass}>{resetErrors.newPassword.message}</p>}
              </div>
              {resetError && <Alert variant="danger">{resetError}</Alert>}
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" fullWidth onClick={closeResetModal}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" fullWidth disabled={isResetting}>
                  {t("common.confirm")}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
