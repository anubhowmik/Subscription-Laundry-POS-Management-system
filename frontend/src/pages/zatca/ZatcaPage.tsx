import { useQuery } from "@tanstack/react-query";
import { Building2, FileCheck2, AlertTriangle } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess, BusinessLocation } from "../../types/api";
import { ZatcaCertificateCell } from "../../components/businessLocations/ZatcaCertificateCell";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th, Tr, Td } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";

export default function ZatcaPage() {
  const { data: locations } = useQuery({
    queryKey: ["all-business-locations-zatca"],
    queryFn: async () => (await api.get<ApiSuccess<BusinessLocation[]>>("/business-locations", { params: { limit: 100 } })).data.data,
  });

  const vatConfiguredCount = locations?.filter((l) => l.vatNumber).length ?? 0;
  const vatMissingCount = locations?.filter((l) => !l.vatNumber).length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="ZATCA KSA"
        subtitle="Saudi e-invoicing compliance certificates, per branch. The VAT number on a branch is required before any invoice can be issued from it."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Building2}
          cardBg="bg-app-zatca-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label="Branches"
          value={String(locations?.length ?? 0)}
        />
        <StatCard
          icon={FileCheck2}
          cardBg="bg-app-zatca-50"
          iconBg="bg-app-zatca-500"
          iconColor="text-white"
          label="VAT Configured"
          value={String(vatConfiguredCount)}
        />
        <StatCard
          icon={AlertTriangle}
          cardBg="bg-amber-50"
          iconBg="bg-amber-500"
          iconColor="text-white"
          label="Missing VAT Number"
          value={String(vatMissingCount)}
          warn={vatMissingCount > 0}
        />
      </div>

      <TableContainer>
        <Table>
          <THead>
            <tr>
              <Th>Branch</Th>
              <Th>VAT Number</Th>
              <Th>Status</Th>
              <Th>Certificate</Th>
            </tr>
          </THead>
          <tbody>
            {locations?.map((loc) => (
              <Tr key={loc.id}>
                <Td>
                  <div className="font-medium text-slate-800">{loc.branchName}</div>
                  <div className="text-xs text-slate-400">{loc.branchCode}</div>
                </Td>
                <Td className="ltr-nums">{loc.vatNumber ?? <span className="text-amber-600">Missing</span>}</Td>
                <Td>
                  <Badge variant={loc.status === "ACTIVE" ? "success" : "neutral"}>{loc.status}</Badge>
                </Td>
                <Td>
                  <ZatcaCertificateCell locationId={loc.id} hasVatNumber={Boolean(loc.vatNumber)} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableContainer>
    </div>
  );
}
