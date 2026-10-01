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

export const memberPermissionsSchema = z
  .object({
    role: memberRoleSchema.default("member"),
    canCreateListings: z.boolean().default(true),
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
  value: OrganizationPermissions,
): OrganizationPermissions {
  if (value.role === "superuser") {
    return {
      role: "superuser",
      canCreateListings: true,
      categoryAccess: "all",
      allowedCategoryIds: [],
    };
  }
  return {
    ...value,
    categoryAccess: value.canCreateListings ? value.categoryAccess : "all",
    allowedCategoryIds: value.categoryAccess === "restricted" ? value.allowedCategoryIds : [],
  };
}
