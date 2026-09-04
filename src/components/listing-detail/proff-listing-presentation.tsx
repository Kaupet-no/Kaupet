import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";

import { ListingCard } from "@/components/listing-card";
import type { ListingCardData } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveBrandColors } from "@/lib/brand-color";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PROFF_LISTING_CONCEPT,
  DEFAULT_PROFF_LISTING_FONT,
  DEFAULT_PROFF_LISTING_OVERTITLE,
  type ProffListingFont,
  type ProffListingOvertitle,
  type ProffOrganizationPresentation,
} from "@/components/listing-detail/proff-listing-types";

type BrandStyle = CSSProperties & {
  "--proff-brand": string;
  "--proff-on-brand": string;
  "--proff-name-font": string;
};

const NAME_FONT_FAMILIES: Record<ProffListingFont, string> = {
  newsreader: '"Newsreader Variable", ui-serif, Georgia, serif',
  inter: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
};

function presentationValues(organization: ProffOrganizationPresentation) {
  return {
    concept: organization.concept ?? DEFAULT_PROFF_LISTING_CONCEPT,
    font: organization.font ?? DEFAULT_PROFF_LISTING_FONT,
    overtitle: organization.overtitle ?? DEFAULT_PROFF_LISTING_OVERTITLE,
  };
}

function overtitleLabel(overtitle: ProffListingOvertitle): string {
  return {
    annonse_fra: "Annonse fra",
    presentert_av: "Presentert av",
    bedriftsannonse: "Bedriftsannonse",
  }[overtitle];
}

function formatOrganizationNumber(value: string): string {
  const digits = value.replace(/\D/gu, "");
  return digits.replace(/(\d)(?=(\d{3})+$)/gu, "$1 ");
}

function brandStyle(
  palette: string | null,
  font: ProffListingFont = DEFAULT_PROFF_LISTING_FONT,
): BrandStyle {
  const colors = resolveBrandColors(palette);
  return {
    "--proff-brand": colors.background,
    "--proff-on-brand": colors.foreground,
    "--proff-name-font": NAME_FONT_FAMILIES[font],
  };
}

function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url.replace(/^https?:\/\//u, "").replace(/\/$/u, "");
  }
}

function CompanyLogo({
  organization,
  className,
}: {
  organization: ProffOrganizationPresentation;
  className?: string;
}) {
  if (!organization.logoUrl) return null;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card text-card-foreground",
        className,
      )}
    >
      <img
        src={organization.logoUrl}
        alt={`Logo for ${organization.displayName}`}
        className="size-full object-contain p-2"
      />
    </span>
  );
}

function CompanyRegistration({
  organization,
  inverse = false,
}: {
  organization: ProffOrganizationPresentation;
  inverse?: boolean;
}) {
  return organization.organizationNumber ? (
    <p
      className={cn(
        "mt-1 text-xs",
        inverse ? "text-[var(--proff-on-brand)] opacity-75" : "text-muted-foreground",
      )}
    >
      Org.nr. {formatOrganizationNumber(organization.organizationNumber)}
    </p>
  ) : null;
}

function WebsiteLink({
  organization,
  inverse = false,
  button = false,
}: {
  organization: ProffOrganizationPresentation;
  inverse?: boolean;
  button?: boolean;
}) {
  if (!organization.websiteUrl) return null;

  const link = (
    <a
      href={organization.websiteUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`Besøk nettsiden til ${organization.displayName} (åpnes i ny fane)`}
      className={cn(
        "inline-flex min-h-12 items-center gap-2 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        inverse
          ? "border border-current px-4 text-[var(--proff-on-brand)] transition-opacity duration-150 hover:opacity-80"
          : !button &&
              "text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground",
      )}
    >
      {button ? "Besøk nettsiden" : websiteLabel(organization.websiteUrl)}
      <ExternalLink className="size-4" aria-hidden="true" />
    </a>
  );

  return button ? (
    <Button asChild variant="outline" className="min-h-12">
      {link}
    </Button>
  ) : (
    link
  );
}

export function ProffListingHeader({
  organization,
  heading = false,
}: {
  organization: ProffOrganizationPresentation;
  heading?: boolean;
}) {
  const Name = heading ? "h1" : "p";
  const { concept, font, overtitle } = presentationValues(organization);
  const style = brandStyle(organization.palette, font);

  if (concept === "redaksjonell") {
    return (
      <section
        aria-label="Bedriftsprofil"
        className="mb-6 border-y border-border py-5"
        style={style}
      >
        <div className="grid items-center gap-4 border-l-[0.375rem] border-l-[var(--proff-brand)] pl-4 sm:grid-cols-[auto_1fr_auto] sm:gap-5 sm:pl-6">
          <CompanyLogo
            organization={organization}
            className="size-16 border border-border sm:size-20"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {overtitleLabel(overtitle)}
            </p>
            <Name
              className="mt-1 text-2xl leading-tight tracking-tight sm:text-3xl"
              style={{ fontFamily: "var(--proff-name-font)" }}
            >
              {organization.displayName}
            </Name>
            <CompanyRegistration organization={organization} />
          </div>
          <WebsiteLink organization={organization} />
        </div>
      </section>
    );
  }

  if (concept === "butikk") {
    return (
      <section
        aria-label="Bedriftsprofil"
        className="relative isolate mb-6 overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-5"
        style={style}
      >
        <span
          className="absolute inset-y-0 left-0 w-1.5 bg-[var(--proff-brand)]"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-4 pl-2 sm:flex-row sm:items-center">
          <CompanyLogo organization={organization} className="size-14 border border-border" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {overtitleLabel(overtitle)}
            </p>
            <Name
              className="mt-1 text-xl font-semibold leading-tight sm:text-2xl"
              style={{ fontFamily: "var(--proff-name-font)" }}
            >
              {organization.displayName}
            </Name>
            <CompanyRegistration organization={organization} />
          </div>
          <WebsiteLink organization={organization} button />
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Bedriftsprofil"
      className="relative isolate mb-6 overflow-hidden rounded-2xl bg-[var(--proff-brand)] p-5 text-[var(--proff-on-brand)] sm:p-6"
      style={style}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <CompanyLogo organization={organization} className="size-16 sm:size-20" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">
            {overtitleLabel(overtitle)}
          </p>
          <Name
            className="mt-1 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl"
            style={{ fontFamily: "var(--proff-name-font)" }}
          >
            {organization.displayName}
          </Name>
          <CompanyRegistration organization={organization} inverse />
        </div>
        <WebsiteLink organization={organization} inverse />
      </div>
    </section>
  );
}

export function ProffRelatedListings({
  organization,
  listings,
  loading,
}: {
  organization: ProffOrganizationPresentation;
  listings: ListingCardData[] | undefined;
  loading: boolean;
}) {
  const { concept, font } = presentationValues(organization);
  const style = brandStyle(organization.palette, font);
  const compact = concept === "butikk";
  const content = loading
    ? Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className={compact ? "h-24 rounded-lg" : "aspect-[4/3] rounded-lg"} />
      ))
    : (listings ?? []).map((listing) => (
        <ListingCard key={listing.id} listing={listing} compact={compact} />
      ));

  return (
    <section
      className={cn(
        "mt-12",
        concept === "redaksjonell" &&
          "rounded-2xl bg-[color-mix(in_oklab,var(--proff-brand)_8%,var(--color-background))] px-4 py-8 sm:px-6",
        concept === "butikk" && "border-y border-border py-8",
      )}
      style={style}
      aria-labelledby="organization-listings-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-[0.14em]",
              concept === "redaksjonell" ? "text-[var(--proff-brand)]" : "text-muted-foreground",
            )}
          >
            {concept === "butikk" ? "Mer fra butikken" : "Oppdag mer"}
          </p>
          <h2
            id="organization-listings-heading"
            className={cn(
              "mt-1 font-display tracking-tight",
              concept === "redaksjonell" ? "text-3xl" : "text-2xl",
            )}
          >
            Flere annonser fra {organization.displayName}
          </h2>
        </div>
        <Button asChild variant={concept === "signatur" ? "outline" : "ghost"} className="min-h-12">
          <Link to="/bedrift/$organizationId" params={{ organizationId: organization.id }}>
            Se alle annonser fra {organization.displayName}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
      {loading || listings?.length ? (
        <div
          className={cn(
            "mt-5 grid gap-4",
            compact ? "md:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4",
          )}
        >
          {content}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          Bedriften har ingen andre aktive annonser akkurat nå.
        </p>
      )}
    </section>
  );
}
