import { z } from "zod";

export const productCategoryName = z.string().trim().min(1).max(100);
export const productCategoryId = z.number().int().positive();

export function isProductCategoryReferenceError(error: unknown) {
  return typeof error === "object" && error !== null
    && "code" in error && error.code === "23503"
    && "constraint" in error && error.constraint === "products_category_org_fk";
}
