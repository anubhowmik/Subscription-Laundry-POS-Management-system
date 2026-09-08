import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { platformApi } from "../../api/platformClient";
import { confirmAction } from "../../stores/confirmStore";
import { usePlatformAuth } from "../../contexts/PlatformAuthContext";
import type { ApiSuccess } from "../../types/api";

interface PlatformOrganization {
  id: string;
  nameEn: string;
  nameAr: string;
  slug: string;
  status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
  createdAt: string;
  userCount: number;
  branchCount: number;
  planNameEn: string | null;
  maxBranches: number | null;
  maxUsers: number | null;
  billingInterval: string | null;
  subscriptionStatus: string | null;
  hasAccess: boolean;
  accessReason: string;
  isTrial: boolean;
  trialDaysLeft: number | null;
  expiresAt: string | null;
}

interface PlatformPayment {
  id: string;
  organizationName: string;
  planCode: string;
  amount: string;
  currency: string;
  billingInterval: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

interface Stats {
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  paidPaymentCount: number;
  totalRevenue: string;
}

interface OrgUserRow {
  id: string;
  fullNameEn: string;
  fullNameAr: string | null;
  username: string | null;
  email: string | null;
  emailVerified: boolean;
  status: "ACTIVE" | "INACTIVE";
  allowLogin: boolean;
  isSystemAdmin: boolean;
  roleNameEn: string;
  lastLoginAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

interface PlatformAdminRow {
  id: string;
  username: string;
  email: string;
  fullName: string;
  status: "ACTIVE" | "INACTIVE";
  isOwner: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function PlatformConsolePage() {
  const { admin, loading, logout } = usePlatformAuth();
  const [orgs, setOrgs] = useState<PlatformOrganization[]>([]);
  const [payments, setPayments] = useState<PlatformPayment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [admins, setAdmins] = useState<PlatformAdminRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [resetTarget, setResetTarget] = useState<PlatformAdminRow | null>(null);
  const [usersTarget, setUsersTarget] = useState<PlatformOrganization | null>(null);

  const load = useCallback(async () => {
    const [o, p, s, a] = await Promise.all([
      platformApi.get<ApiSuccess<PlatformOrganization[]>>("/organizations"),
      platformApi.get<ApiSuccess<PlatformPayment[]>>("/payments"),
      platformApi.get<ApiSuccess<Stats>>("/stats"),
      platformApi.get<ApiSuccess<PlatformAdminRow[]>>("/admins"),
    ]);
    setOrgs(o.data.data);
    setPayments(p.data.data);
    setStats(s.data.data);
    setAdmins(a.data.data);
  }, []);

  useEffect(() => {
    if (admin) load().catch(() => setError("Failed to load platform data"));
  }, [admin, load]);

  if (loading) return null;
  if (!admin) return <Navigate to="/platform/login" replace />;

  async function toggleStatus(org: PlatformOrganization) {
    const next = org.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    if (
      next === "SUSPENDED" &&
      !(await confirmAction({
        message: `Suspend "${org.nameEn}"? Everyone in this company will be signed out and blocked from logging in.`,
        danger: true,
      }))
    ) {
      return;
    }
    setBusyId(org.id);
    setError(null);
    try {
      await platformApi.patch(`/organizations/${org.id}/status`, { status: next });
      await load();
    } catch {
      setError(`Could not update ${org.nameEn}`);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAdminStatus(target: PlatformAdminRow) {
    const next = target.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
    if (
      next === "INACTIVE" &&
      !(await confirmAction({ message: `Deactivate "${target.fullName}"? They'll be signed out and unable to log back in.`, danger: true }))
    ) {
      return;
    }
    setBusyId(target.id);
    setError(null);
    try {
      await platformApi.patch(`/admins/${target.id}/status`, { status: next });
      await load();
    } catch (err) {
      // Surfaced verbatim - these two specific guards (can't deactivate yourself, can't
      // deactivate the last remaining admin) are the whole point of showing the real message.
      setError(isAxiosError(err) ? err.response?.data?.message ?? `Could not update ${target.fullName}` : `Could not update ${target.fullName}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <header className="border-b border-slate-700 bg-slate-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🛡️</span>
            <div>
              <h1 className="text-base font-semibold text-white">Platform Console</h1>
              <p className="text-xs text-slate-400">{admin.fullName}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {error && <p className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-300">{error}</p>}

        {stats && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Companies" value={String(stats.totalOrganizations)} />
            <StatCard label="Active" value={String(stats.activeOrganizations)} />
            <StatCard label="Suspended" value={String(stats.suspendedOrganizations)} tone={stats.suspendedOrganizations > 0 ? "warn" : "normal"} />
            <StatCard label="Revenue (SAR)" value={Number(stats.totalRevenue).toLocaleString()} />
          </div>
        )}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Companies</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Subscription</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Users</th>
                  <th className="px-4 py-3">Branches</th>
                  <th className="px-4 py-3 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {orgs.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{org.nameEn}</div>
                      <div className="text-xs text-slate-500">{org.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={org.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-300">
                        {org.planNameEn ?? "—"}
                        {org.billingInterval && <span className="text-slate-500"> · {org.billingInterval.toLowerCase()}</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {org.isTrial ? `Trial · ${org.trialDaysLeft} days left` : org.accessReason.replace(/_/g, " ").toLowerCase()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {org.expiresAt ? new Date(org.expiresAt).toISOString().slice(0, 10) : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <UsageCell used={org.userCount} max={org.maxUsers} />
                    </td>
                    <td className="px-4 py-3">
                      <UsageCell used={org.branchCount} max={org.maxBranches} />
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setUsersTarget(org)}
                          className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                        >
                          Users
                        </button>
                        <button
                          onClick={() => toggleStatus(org)}
                          disabled={busyId === org.id}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50 ${
                            org.status === "SUSPENDED"
                              ? "bg-blue-600 text-white hover:bg-blue-700"
                              : "bg-red-900 text-red-200 hover:bg-red-800"
                          }`}
                        >
                          {org.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {orgs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No companies registered yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Platform Admins</h2>
            <button
              onClick={() => setShowAddAdmin(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              + Add Admin
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {admins.map((a) => {
                  const isSelf = a.id === admin.id;
                  // Only the owner can act on another admin's password or status - a non-owner
                  // can only ever touch their own account. Blocked server-side too; this just
                  // avoids showing a live button for an action that will only ever error.
                  const lockedForMe = !isSelf && !admin.isOwner;
                  return (
                    <tr key={a.id} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3 text-white">
                        {a.fullName} {isSelf && <span className="text-xs text-slate-500">(you)</span>}
                        {a.isOwner && <span className="ms-1.5 rounded-full bg-amber-950 px-2 py-0.5 text-[10px] font-semibold text-amber-300">OWNER</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{a.username}</td>
                      <td className="px-4 py-3 text-slate-400">{a.email}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${a.status === "ACTIVE" ? "bg-blue-950 text-blue-300" : "bg-slate-700 text-slate-300"}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {a.lastLoginAt ? new Date(a.lastLoginAt).toISOString().slice(0, 10) : "Never"}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setResetTarget(a)}
                            disabled={lockedForMe}
                            title={lockedForMe ? "Only the owner can reset another admin's password" : undefined}
                            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Reset password
                          </button>
                          <button
                            onClick={() => toggleAdminStatus(a)}
                            disabled={busyId === a.id || isSelf || lockedForMe}
                            title={
                              isSelf
                                ? "You cannot deactivate your own account"
                                : lockedForMe
                                  ? "Only the owner can change another admin's status"
                                  : undefined
                            }
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-40 ${
                              a.status === "INACTIVE" ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-red-900 text-red-200 hover:bg-red-800"
                            }`}
                          >
                            {a.status === "INACTIVE" ? "Reactivate" : "Deactivate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {admins.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No platform admins found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Payments</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Interval</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-white">{p.organizationName}</td>
                    <td className="px-4 py-3">{Number(p.amount).toLocaleString()} {p.currency}</td>
                    <td className="px-4 py-3 text-slate-400">{p.billingInterval}</td>
                    <td className="px-4 py-3">{p.status}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(p.paidAt ?? p.createdAt).toISOString().slice(0, 10)}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No payments yet — payment collection is not wired up
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {showAddAdmin && (
        <AddAdminModal
          onClose={() => setShowAddAdmin(false)}
          onCreated={async () => {
            setShowAddAdmin(false);
            await load();
          }}
        />
      )}

      {resetTarget && (
        <ResetAdminPasswordModal
          target={resetTarget}
          isSelf={resetTarget.id === admin.id}
          onClose={() => setResetTarget(null)}
          onDone={() => setResetTarget(null)}
        />
      )}

      {usersTarget && <OrgUsersModal org={usersTarget} onClose={() => setUsersTarget(null)} />}
    </div>
  );
}

function StatCard({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warn" }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "warn" ? "text-amber-400" : "text-white"}`}>{value}</p>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  widthClassName = "max-w-sm",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={`w-full rounded-lg border border-slate-700 bg-slate-800 p-5 ${widthClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-sm font-semibold text-white">{title}</h3>
        {children}
      </div>
    </div>
  );
}

const modalInputClass =
  "w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30";
const modalLabelClass = "mb-1 block text-xs font-medium text-slate-400";

function AddAdminModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await platformApi.post("/admins", { username, email, fullName, password });
      onCreated();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.message ?? "Could not create admin" : "Could not create admin");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Add Platform Admin" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={modalLabelClass}>Full Name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={modalInputClass} />
        </div>
        <div>
          <label className={modalLabelClass}>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={modalInputClass} />
        </div>
        <div>
          <label className={modalLabelClass}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={modalInputClass} />
        </div>
        <div>
          <label className={modalLabelClass}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={modalInputClass} />
        </div>
        {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !username || !email || !fullName || password.length < 8}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "…" : "Create"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ResetAdminPasswordModal({
  target,
  isSelf,
  onClose,
  onDone,
}: {
  target: PlatformAdminRow;
  isSelf: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // Changing your OWN password proves you still know the current one (blocks a stolen session
  // token from locking you out by changing it); resetting someone ELSE's is an administrative
  // override with no current password to check. Either way, typing the new one twice catches a
  // typo before it happens instead of after you're locked out.
  const mismatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = newPassword.length >= 8 && newPassword === confirmPassword && (!isSelf || currentPassword.length > 0);

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await platformApi.post(`/admins/${target.id}/reset-password`, {
        newPassword,
        ...(isSelf ? { currentPassword } : {}),
      });
      setSuccess(true);
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.message ?? "Could not reset password" : "Could not reset password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={isSelf ? "Change Your Password" : `Reset Password — ${target.fullName}`} onClose={onClose}>
      {success ? (
        <div className="space-y-3">
          <p className="rounded-lg bg-blue-950 px-3 py-2 text-xs text-blue-300">
            {isSelf
              ? "Password changed. You've been signed out everywhere else and must log in again with the new password."
              : `Password reset. ${target.fullName} has been signed out everywhere and must log in with the new password.`}
          </p>
          <button onClick={onDone} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {isSelf && (
            <div>
              <label className={modalLabelClass}>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={modalInputClass}
                autoFocus
              />
            </div>
          )}
          <div>
            <label className={modalLabelClass}>New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={modalInputClass} />
          </div>
          <div>
            <label className={modalLabelClass}>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={modalInputClass}
            />
            {mismatch && <p className="mt-1 text-xs text-red-400">Passwords don't match</p>}
          </div>
          {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving || !canSubmit}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "…" : isSelf ? "Change Password" : "Reset"}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function OrgUsersModal({ org, onClose }: { org: PlatformOrganization; onClose: () => void }) {
  const [users, setUsers] = useState<OrgUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    platformApi
      .get<ApiSuccess<OrgUserRow[]>>(`/organizations/${org.id}/users`)
      .then((res) => {
        if (!cancelled) setUsers(res.data.data);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load users");
      });
    return () => {
      cancelled = true;
    };
  }, [org.id]);

  return (
    <ModalShell title={`Users — ${org.nameEn}`} onClose={onClose} widthClassName="max-w-3xl">
      {error && <p className="mb-3 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}
      <div className="max-h-[60vh] overflow-y-auto overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Verified</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users?.map((u) => (
              <tr key={u.id} className="hover:bg-slate-800/50">
                <td className="px-4 py-3 text-white">
                  {u.fullNameEn}
                  {u.isSystemAdmin && <span className="ms-1.5 text-xs text-slate-500">(admin)</span>}
                  {u.deletedAt && <span className="ms-1.5 text-xs text-red-400">(deleted)</span>}
                </td>
                <td className="px-4 py-3 text-slate-300">{u.email ?? <span className="text-slate-600">—</span>}</td>
                <td className="px-4 py-3 text-slate-400">{u.roleNameEn}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      u.emailVerified ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"
                    }`}
                  >
                    {u.emailVerified ? "Verified" : "Unverified"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      u.status === "ACTIVE" && u.allowLogin ? "bg-blue-950 text-blue-300" : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {u.status === "ACTIVE" && u.allowLogin ? "Active" : u.status === "ACTIVE" ? "No login" : u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toISOString().slice(0, 10) : "Never"}
                </td>
              </tr>
            ))}
            {users?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No users in this organization
                </td>
              </tr>
            )}
            {users === null && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}

function UsageCell({ used, max }: { used: number; max: number | null }) {
  if (max === null) return <span className="text-slate-400">{used} <span className="text-slate-600">/ ∞</span></span>;
  const atLimit = used >= max;
  return (
    <span className={atLimit ? "font-medium text-amber-400" : "text-slate-400"}>
      {used} <span className={atLimit ? "text-amber-500" : "text-slate-600"}>/ {max}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    TRIAL: "bg-blue-950 text-blue-300",
    ACTIVE: "bg-blue-950 text-blue-300",
    SUSPENDED: "bg-red-950 text-red-300",
    CANCELLED: "bg-slate-700 text-slate-300",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? styles.CANCELLED}`}>
      {status}
    </span>
  );
}
