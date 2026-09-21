import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // 1 min — avoid refetching on every navigation
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preloader ruter på hover/touch («intent»). StaleTime kan da ikke være 0
    // — det ville fått hvert eneste hover til å refetche loader-dataen.
    // Delay på 150 ms (mot standardens 50) fordi et resultatgrid har 20+
    // lenker: uten den ville et musesveip over rutenettet fyrt av én
    // loader-forespørsel per kort man passerte.
    defaultPreload: "intent",
    defaultPreloadDelay: 150,
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
