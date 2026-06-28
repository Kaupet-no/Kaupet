import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListingsTab } from "@/components/admin/moderasjon/listings-tab";
import { BansTab } from "@/components/admin/moderasjon/bans-tab";
import { SuspensionsTab } from "@/components/admin/moderasjon/suspensions-tab";
import { IpBansTab } from "@/components/admin/moderasjon/ip-bans-tab";
import { LogTab } from "@/components/admin/moderasjon/log-tab";
import { ErrorLogTab } from "@/components/admin/moderasjon/error-log-tab";
import { ReportsTab } from "@/components/admin/moderasjon/reports-tab";
import { useIsAdmin } from "@/lib/use-is-admin";

export const Route = createFileRoute("/_authenticated/admin/moderasjon")({
  head: () => ({ meta: [{ title: "Moderasjon — Kaupet.no" }] }),
  component: ModerationPage,
});

function ModerationPage() {
  const { data: isAdmin } = useIsAdmin();

  return (
    <Tabs defaultValue="reports" className="space-y-6">
      <TabsList className="flex flex-wrap">
        <TabsTrigger value="reports">Varsler</TabsTrigger>
        {isAdmin && (
          <>
            <TabsTrigger value="listings">Annonser</TabsTrigger>
            <TabsTrigger value="bans">Utestengte</TabsTrigger>
            <TabsTrigger value="suspensions">Svartelistede</TabsTrigger>
            <TabsTrigger value="ips">IP-sperrer</TabsTrigger>
            <TabsTrigger value="log">Logg</TabsTrigger>
            <TabsTrigger value="errors">Feillogg</TabsTrigger>
          </>
        )}
      </TabsList>
      <TabsContent value="reports">
        <ReportsTab />
      </TabsContent>
      {isAdmin && (
        <>
          <TabsContent value="listings">
            <ListingsTab />
          </TabsContent>
          <TabsContent value="bans">
            <BansTab />
          </TabsContent>
          <TabsContent value="suspensions">
            <SuspensionsTab />
          </TabsContent>
          <TabsContent value="ips">
            <IpBansTab />
          </TabsContent>
          <TabsContent value="log">
            <LogTab />
          </TabsContent>
          <TabsContent value="errors">
            <ErrorLogTab />
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}
