import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "@/components/inbox-page";

export const Route = createFileRoute("/_authenticated/meldinger/")({
  head: () => ({
    meta: [
      { title: "Meldinger — Kaupet.no" },
      { name: "description", content: "Dine samtaler med kjøpere og selgere." },
    ],
  }),
  component: InboxPage,
});
