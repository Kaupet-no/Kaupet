import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import {
  adminListUnverifiedOrganizations,
  adminVerifyOrganization,
} from "@/lib/admin-organizations.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatErrorMessage } from "@/lib/errors";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/admin/bedrifter")({
  head: () => ({ meta: [{ title: "Bedrifter — Administrasjon" }] }),
  component: AdminOrganizationsPage,
});

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("nb-NO");
}

function AdminOrganizationsPage() {
  const qc = useQueryClient();
  const listUnverified = useServerFn(adminListUnverifiedOrganizations);
  const verify = useServerFn(adminVerifyOrganization);

  const { data: organizations, isLoading } = useQuery({
    queryKey: ["admin-unverified-organizations"],
    queryFn: () => listUnverified(),
  });

  const verifyMutation = useMutation({
    mutationFn: (organizationId: string) => verify({ data: { organizationId } }),
    onSuccess: () => {
      showSuccessToast("Bedriften er godkjent.");
      qc.invalidateQueries({ queryKey: ["admin-unverified-organizations"] });
    },
    onError: (error) =>
      showErrorToast(formatErrorMessage(error, "Kunne ikke godkjenne bedriften.")),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Uverifiserte bedrifter</CardTitle>
          <p className="text-sm text-muted-foreground">
            Nyregistrerte bedriftskontoer kan ikke publisere annonser under firmanavn før de er
            godkjent her. Sjekk at organisasjonsnummeret faktisk tilhører den som registrerte seg
            før du godkjenner.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !organizations || organizations.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ingen bedrifter venter på godkjenning.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Navn</TableHead>
                  <TableHead>Org.nr</TableHead>
                  <TableHead>Registrert</TableHead>
                  <TableHead className="text-right">Handling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div className="font-medium">{org.display_name}</div>
                      {org.legal_name !== org.display_name && (
                        <div className="text-xs text-muted-foreground">{org.legal_name}</div>
                      )}
                    </TableCell>
                    <TableCell>{org.organization_number}</TableCell>
                    <TableCell>{formatDate(org.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => verifyMutation.mutate(org.id)}
                        disabled={verifyMutation.isPending}
                      >
                        Godkjenn
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
