import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { platformApi } from "../../api/platformClient";
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

export default function PlatformConsolePage() {
  const { admin, loading, logout } = usePlatformAuth();
  const [orgs, setOrgs] = useState<PlatformOrganization[]>([]);
  const [payments, setPayments] = useState<PlatformPayment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [o, p, s] = await Promise.all([
      platformApi.get<ApiSuccess<PlatformOrganization[]>>("/organizations"),
      platformApi.get<ApiSuccess<PlatformPayment[]>>("/payments"),
      platformApi.get<ApiSuccess<Stats>>("/stats"),
    ]);
    setOrgs(o.data.data);
    setPayments(p.data.data);
    setStats(s.data.data);
  }, []);

  useEffect(() => {
    if (admin) load().catch(() => setError("Failed to load platform data"));
  }, [admin, load]);

  if (loading) return null;
  if (!admin) return <Navigate to="/platform/login" replace />;

  async function toggleStatus(org: PlatformOrganization) {
    const next = org.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    if (next === "SUSPENDED" && !window.confirm(`Suspend "${org.nameEn}"? Everyone in this company will be signed out and blocked from logging in.`)) {
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
            className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-600"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {error && <p className="rounded-md bg-red-950 px-4 py-3 text-sm text-red-300">{error}</p>}

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
                      <div className="text-slate-300">{org.billingInterval ?? "—"}</div>
                      <div className="text-xs text-slate-500">
                        {org.isTrial ? `Trial · ${org.trialDaysLeft} days left` : org.accessReason.replace(/_/g, " ").toLowerCase()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {org.expiresAt ? new Date(org.expiresAt).toISOString().slice(0, 10) : "Never"}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{org.userCount}</td>
                    <td className="px-4 py-3 text-slate-400">{org.branchCount}</td>
                    <td className="px-4 py-3 text-end">
                      <button
                        onClick={() => toggleStatus(org)}
                        disabled={busyId === org.id}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                          org.status === "SUSPENDED"
                            ? "bg-sky-600 text-white hover:bg-sky-700"
                            : "bg-red-900 text-red-200 hover:bg-red-800"
                        }`}
                      >
                        {org.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                      </button>
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    TRIAL: "bg-sky-950 text-sky-300",
    ACTIVE: "bg-sky-950 text-sky-300",
    SUSPENDED: "bg-red-950 text-red-300",
    CANCELLED: "bg-slate-700 text-slate-300",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? styles.CANCELLED}`}>
      {status}
    </span>
  );
}
