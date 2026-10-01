import { z } from "zod";

export const uuid = z.string().uuid();
export const memberRoleSchema = z.enum(["superuser", "member"]);
export const listingAccessSchema = z.enum(["own", "all"]);
export const chatAccessSchema = z.enum(["own", "all"]);
export const listingEditScopeSchema = z.enum(["none", "own", "all"]);
export const categoryAccessSchema = z.enum(["all", "restricted"]);

export type OrganizationPermissions = {
  role: "superuser" | "member";
  canCreateListings: boolean;
  categoryAccess: "all" | "restricted";
  allowedCategoryIds: string[];
};

/** Temporary wire-compatible shape while callers migrate to location scope. */
export type OrganizationMemberPermissions = OrganizationPermissions & {
  listingAccess: "own" | "all";
  chatAccess: "own" | "all";
  listingEditScope: "none" | "own" | "all";
};

export const memberPermissionsSchema = z
  .object({
    role: memberRoleSchema.default("member"),
    listingAccess: listingAccessSchema.default("own"),
    chatAccess: chatAccessSchema.default("own"),
    canCreateListings: z.boolean().default(true),
    listingEditScope: listingEditScopeSchema.default("own"),
    categoryAccess: categoryAccessSchema.default("all"),
    allowedCategoryIds: z.array(uuid).default([]),
  })
  .superRefine((value, context) => {
    if (
      value.role === "member" &&
      value.canCreateListings &&
      value.categoryAccess === "restricted" &&
      value.allowedCategoryIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedCategoryIds"],
        message: "Velg minst én kategori.",
      });
    }
  });
export function normalizeMemberPermissions(
  value: OrganizationMemberPermissions,
): OrganizationMemberPermissions {
  if (value.role === "superuser") {
    return {
      role: "superuser",
      listingAccess: "all",
      chatAccess: "all",
      canCreateListings: true,
      listingEditScope: "all",
      categoryAccess: "all",
      allowedCategoryIds: [],
    };
  }
  return {
    ...value,
    listingAccess: value.listingEditScope === "all" ? "all" : value.listingAccess,
    categoryAccess: value.canCreateListings ? value.categoryAccess : "all",
    allowedCategoryIds: value.categoryAccess === "restricted" ? value.allowedCategoryIds : [],
  };
}
