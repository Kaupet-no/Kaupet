// Every createServerFn must use an auth middleware, or be listed in ALLOWLIST
// below with a reason. Catches "forgotten auth" vs "deliberately public".
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const AUTH_MIDDLEWARE = ["requireSupabaseAuth"];

// key: "file#exportName" -> reason
const ALLOWLIST = {
  "src/lib/attribute-bounds.functions.ts#getAttributeRangeBounds": "public read, rate-limited",
  "src/lib/attribute-suggestions.functions.ts#getAttributeValueSuggestions":
    "public read, rate-limited",
  "src/lib/business/signup.functions.ts#bindBusinessSignupEmail":
    "token-authorized (signup_token), pre-signup",
  "src/lib/business/signup.functions.ts#lookupBusinessOrganization":
    "pre-signup, Turnstile + rate limit",
  "src/lib/category-suggestion.functions.ts#getPhotoSuggestionAvailability": "public feature flag",
  "src/lib/category-suggestion.functions.ts#suggestCategoryForTitle": "public read, rate-limited",
  "src/lib/category-suggestion.functions.ts#suggestCategoryForTitleWithAi":
    "public, Turnstile + rate limit",
  "src/lib/category-suggestion.functions.ts#suggestListingFromPhotos":
    "public, Turnstile + rate limit",
  "src/lib/current-user.functions.ts#getSessionUser": "cookie session, returns null when anonymous",
  "src/lib/feedback.functions.ts#submitCategorySuggestion":
    "anonymous allowed, optional bearer attribution, DB rate limit",
  "src/lib/feedback.functions.ts#submitFeedback":
    "anonymous allowed, optional bearer attribution, DB rate limit",
  "src/lib/keyword-suggestion.functions.ts#suggestKeywordsForListing": "public read, rate-limited",
  "src/lib/listing-facet.functions.ts#getListingFacetCounts": "public read, rate-limited",
  "src/lib/listing-views.functions.ts#logListingView":
    "anonymous analytics, DB rate limit by IP hash",
  "src/lib/listings.functions.ts#getListingKaupetCodeById": "public read, active listings only",
  "src/lib/my-listings.functions.ts#getMyListingRows":
    "inline getUser on cookie session, returns [] when anonymous",
  "src/lib/product-analytics.functions.ts#logProductEvent":
    "anonymous analytics, DB rate limit by IP hash",
  "src/lib/promotions.functions.ts#getFeaturedListings": "public read",
  "src/lib/promotions.functions.ts#getPromotionPricing": "public read",
  "src/lib/reviews.functions.ts#getPublicProfile": "public profile read",
  "src/lib/reviews.functions.ts#listUserReviews": "public reviews read",
  "src/lib/vehicle/vehicle-360.functions.ts#completeVehicle360CaptureSession":
    "token-authorized (QR capture token)",
  "src/lib/vehicle/vehicle-360.functions.ts#getVehicle360CaptureSession":
    "token-authorized (QR capture token)",
  "src/lib/vehicle/vehicle-360.functions.ts#uploadVehicle360Frame":
    "token-authorized (QR capture token), DB upload quota",
  "src/lib/wtb-listings.functions.ts#countWtbListings": "public read",
  "src/lib/wtb-listings.functions.ts#listWtbListings": "public read",
  "src/lib/wtb-listings.functions.ts#matchListingsForWtb": "public read, rate-limited",
  "src/lib/wtb-listings.functions.ts#matchWtbListingsForListing": "public aggregate count",
};

const found = new Map(); // key -> { hasAuth, line }

function visit(path) {
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry);
    if (statSync(fullPath).isDirectory()) {
      visit(fullPath);
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    const source = readFileSync(fullPath, "utf8");
    if (!source.includes("createServerFn(")) continue;
    const file = relative(process.cwd(), fullPath);
    const sf = ts.createSourceFile(fullPath, source, ts.ScriptTarget.Latest, true);
    const walk = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "createServerFn"
      ) {
        // Climb the .a(...).b(...) chain up to and including .handler(...).
        let chainEnd = node;
        let chainText = "";
        while (
          ts.isPropertyAccessExpression(chainEnd.parent) &&
          chainEnd.parent.expression === chainEnd &&
          ts.isCallExpression(chainEnd.parent.parent)
        ) {
          if (chainEnd.parent.name.text === "handler") break;
          chainEnd = chainEnd.parent.parent;
          chainText = chainEnd.getText(sf);
        }
        let decl = node.parent;
        while (decl && !ts.isVariableDeclaration(decl)) decl = decl.parent;
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const name = decl && ts.isIdentifier(decl.name) ? decl.name.text : `<anonymous@${line}>`;
        found.set(`${file}#${name}`, {
          hasAuth: AUTH_MIDDLEWARE.some((m) => chainText.includes(m)),
          line,
        });
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
  }
}

visit("src");

const errors = [];
for (const [key, { hasAuth, line }] of found) {
  if (!hasAuth && !(key in ALLOWLIST)) {
    errors.push(`${key} (line ${line}): no auth middleware and not in ALLOWLIST`);
  }
  if (hasAuth && key in ALLOWLIST) {
    errors.push(`${key}: uses auth middleware but is still in ALLOWLIST — remove the entry`);
  }
}
for (const key of Object.keys(ALLOWLIST)) {
  if (!found.has(key)) errors.push(`${key}: ALLOWLIST entry no longer exists — remove it`);
}

if (errors.length > 0) {
  console.error(
    "createServerFn auth check failed. Add .middleware([requireSupabaseAuth]) or, if deliberately\n" +
      "public/self-authorizing, add the function to ALLOWLIST in scripts/check-server-fn-auth.mjs:\n" +
      errors.map((e) => `  - ${e}`).join("\n"),
  );
  process.exit(1);
}
const withAuth = [...found.values()].filter((f) => f.hasAuth).length;
console.log(
  `Server fn auth OK: ${withAuth} with middleware, ${Object.keys(ALLOWLIST).length} allowlisted.`,
);
