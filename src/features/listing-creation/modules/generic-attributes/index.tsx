import { AttributeFields } from "@/components/attribute-fields";

import type { CategoryModule, CategoryModuleProps } from "../types";

/** Thin wrapper so the existing AttributeFields (also reused by search filters) fits the CategoryModule contract. */
export function GenericAttributesModule(props: CategoryModuleProps) {
  return <AttributeFields {...props} required />;
}

export const genericAttributesModule: CategoryModule = {
  key: "generic-attributes",
  Component: GenericAttributesModule,
  order: 10,
};
