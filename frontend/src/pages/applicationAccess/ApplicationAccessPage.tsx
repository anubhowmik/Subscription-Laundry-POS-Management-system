import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th, Tr, Td } from "../../components/ui/Table";
import { selectClass } from "../../components/ui/formClasses";
import { Users, Fingerprint } from "lucide-react";

interface UserRow {
  id: string;
  username: string | null;
  fullNameEn: string;
  isSystemAdmin: boolean;
  role: { nameEn: string };
  appAccessPosLaundry: boolean | null;
  appAccessUsersRules: boolean | null;
  appAccessZatca: boolean | null;
}

type OverrideValue = "" | "true" | "false";

const APPS: { key: "appAccessPosLaundry" | "appAccessUsersRules" | "appAccessZatca"; label: string }[] = [
  { key: "appAccessPosLaundry", label: "POS Laundry" },
  { key: "appAccessUsersRules", label: "Users & Rules" },
  { key: "appAccessZatca", label: "ZATCA KSA" },
];

function toOverrideValue(v: boolean | null): OverrideValue {
  return v === null ? "" : v ? "true" : "false";
}
function fromOverrideValue(v: OverrideValue): boolean | null {
  return v === "" ? null : v === "true";
}

export default function ApplicationAccessPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<ApiSuccess<UserRow[]>>("/users", { params: { limit: 200 } })).data.data,
  });

  const mutation = useMutation({
    mutationFn: async ({ userId, field, value }: { userId: string; field: (typeof APPS)[number]["key"]; value: boolean | null }) => {
      const current = users?.find((u) => u.id === userId);
      if (!current) return;
      await api.put(`/users/${userId}/app-access`, {
        appAccessPosLaundry: field === "appAccessPosLaundry" ? value : current.appAccessPosLaundry,
        appAccessUsersRules: field === "appAccessUsersRules" ? value : current.appAccessUsersRules,
        appAccessZatca: field === "appAccessZatca" ? value : current.appAccessZatca,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
    onError: () => setError("Could not update application access. Only a system admin can change this."),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Application Access"
        subtitle="Per-user override on top of each role's default app access. Leave as 'Inherit from role' unless a specific exception is needed."
      />

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard
          icon={Users}
          cardBg="bg-app-users-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label="Users"
          value={String(users?.length ?? 0)}
        />
        <StatCard
          icon={Fingerprint}
          cardBg="bg-sky-50"
          iconBg="bg-sky-500"
          iconColor="text-white"
          label="With Overrides"
          value={String(
            users?.filter((u) => u.appAccessPosLaundry !== null || u.appAccessUsersRules !== null || u.appAccessZatca !== null).length ?? 0,
          )}
        />
      </div>

      {!currentUser?.isSystemAdmin && (
        <Alert variant="info">Only a system admin can change application access - you can view the current settings below.</Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <TableContainer>
        <Table>
          <THead>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              {APPS.map((app) => (
                <Th key={app.key}>{app.label}</Th>
              ))}
            </tr>
          </THead>
          <tbody>
            {users?.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <div className="font-medium text-slate-800">{u.fullNameEn}</div>
                  <div className="text-xs text-slate-400">{u.username}</div>
                </Td>
                <Td>{u.isSystemAdmin ? <span className="text-slate-400">System Admin (all access)</span> : u.role.nameEn}</Td>
                {APPS.map((app) => (
                  <Td key={app.key}>
                    <select
                      className={`${selectClass} w-40`}
                      value={toOverrideValue(u[app.key])}
                      disabled={u.isSystemAdmin || !currentUser?.isSystemAdmin || mutation.isPending}
                      onChange={(e) => {
                        setError(null);
                        mutation.mutate({ userId: u.id, field: app.key, value: fromOverrideValue(e.target.value as OverrideValue) });
                      }}
                    >
                      <option value="">Inherit from role</option>
                      <option value="true">Force grant</option>
                      <option value="false">Force revoke</option>
                    </select>
                  </Td>
                ))}
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableContainer>
    </div>
  );
}
