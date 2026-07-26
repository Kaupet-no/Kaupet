import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Pathless layout for /ny-annonse and its children (currently just
 * /ny-annonse/forhandsvisning). The wizard itself lives in index.tsx (the
 * "/ny-annonse/" index route) — this file exists only so the forhandsvisning
 * child route has somewhere to render: without an explicit <Outlet/> here,
 * navigating to /ny-annonse/forhandsvisning would match the route but never
 * actually paint anything, since TanStack Router nests child route output
 * inside the parent's rendered tree rather than replacing it.
 */
export const Route = createFileRoute("/_authenticated/ny-annonse")({
  component: () => <Outlet />,
});
