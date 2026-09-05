import { z } from "zod/v4";
import { BullionCreate, BullionPatchColumns } from "@dorado/contracts";
import { param } from "#shared/http/caller.ts";
import { parseStrict, strictBody, uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as productService from "#catalog/products/service.ts";

const Query = z.object({
  side: z.enum(["ask", "bid"]).default("ask"),
  placement: z.enum(["storefront", "homepage"]).default("storefront"),
  metal: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  generic: z.stringbool().optional(),
  sort: z.enum(["name", "content", "newest"]).default("name"),
}).strict();

export const listProducts = asyncHandler(async (req, res) => {
  const q = parseStrict(Query, req.query, "products query");
  res.status(200).json(
    await productService.listGroups({
      display: q.side === "ask" ? true : undefined,
      homepage_display: q.placement === "homepage" ? true : undefined,
      metal: q.metal,
      filter_category: q.category,
      type: q.type,
      search: q.search,
      is_generic: q.generic,
      sort: q.sort,
    })
  );
});

export const getProduct = asyncHandler(async (req, res) => {
  res.status(200).json(await productService.getGroupBySlug(param(req, "slug")));
});

export const listAdminProducts = asyncHandler(async (_req, res) => {
  res.status(200).json(await productService.listAdminProducts());
});

export const listTypes = asyncHandler(async (_req, res) => {
  res.status(200).json(await productService.listTypes());
});

export const createProduct = asyncHandler(async (req, res) => {
  const patch = strictBody(BullionCreate.strict(), req.body);
  res.status(201).json(await productService.createProduct(patch));
});

export const updateProduct = asyncHandler(async (req, res) => {
  const patch = strictBody(BullionPatchColumns.strict(), req.body);
  res.status(200).json(await productService.updateProduct(uuidParam(req, "id"), patch));
});
