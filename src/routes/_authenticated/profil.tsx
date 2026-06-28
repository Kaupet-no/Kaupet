import { createFileRoute } from "@tanstack/react-router";
import { useIsNative } from "@/lib/use-is-native";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProfileSection } from "@/components/profil/profile-section";
import { NotificationsSection } from "@/components/profil/notifications-section";
import { BlockedSection } from "@/components/profil/blocked-section";
import { AccountSection } from "@/components/profil/account-section";
import { NativePageHeader } from "@/components/native-page-header";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [{ title: "Min profil — Kaupet.no" }],
  }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: "profil" | "konto" | "varslinger" | "blokkerte" } => {
    const t = search.tab;
    if (t === "konto" || t === "varslinger" || t === "blokkerte" || t === "profil") {
      return { tab: t };
    }
    return {};
  },
  component: ProfilePage,
});

function ProfilePage() {
  const native = useIsNative();
  const { tab = "profil" } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <>
      <NativePageHeader title="Min profil" backLabel="Meg" backTo="/meg" />
      <div className="mx-auto max-w-2xl px-4 py-6">
        {!native && (
          <h1 className="font-display text-3xl tracking-tight max-sm:hidden">Min profil</h1>
        )}

        <Tabs
          value={tab}
          onValueChange={(v) =>
            navigate({
              search: {
                tab:
                  v === "konto" || v === "varslinger" || v === "blokkerte"
                    ? (v as "konto" | "varslinger" | "blokkerte")
                    : "profil",
              },
              replace: true,
            })
          }
          className="mt-6"
        >
          <TabsList>
            <TabsTrigger value="profil">Profilinfo</TabsTrigger>
            <TabsTrigger value="varslinger">Varslinger</TabsTrigger>
            <TabsTrigger value="blokkerte">Blokkerte</TabsTrigger>
            <TabsTrigger value="konto">Konto</TabsTrigger>
          </TabsList>
          <TabsContent value="profil" className="mt-6">
            <ProfileSection />
          </TabsContent>
          <TabsContent value="varslinger" className="mt-6">
            <NotificationsSection />
          </TabsContent>
          <TabsContent value="blokkerte" className="mt-6">
            <BlockedSection />
          </TabsContent>
          <TabsContent value="konto" className="mt-6">
            <AccountSection />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
