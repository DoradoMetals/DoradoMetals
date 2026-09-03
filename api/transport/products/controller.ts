import { callerId, requiredParam } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as productService from "#domain/products/service.ts";

export const getAllProducts = asyncHandler(async (req, res) => {
  res.status(200).json(await productService.getAllProducts());
});

export const getSellProducts = asyncHandler(async (req, res) => {
  res.status(200).json(await productService.getSellProducts());
});

export const getProductFromSlug = asyncHandler(async (req, res) => {
  const rows = await productService.getProductFromSlug(requiredParam(req.query.slug, "slug"));
  if (rows.length === 0) {
    return res.status(404).json({ message: "Not found" });
  }
  res.status(200).json(rows);
});

export const getHomepageProducts = asyncHandler(async (req, res) => {
  res.status(200).json(await productService.getHomepageProducts());
});

export const getFilteredProducts = asyncHandler(async (req, res) => {
  // Optional filters, narrowed one at a time: Express delivers arrays and objects for these too, and a filter nobody sent must read as absent rather than as an object the repo would compare against.
  const metal_type = oneString(req.query.metal_type);
  const filter_category = oneString(req.query.filter_category);
  const product_type = oneString(req.query.product_type);
  res
    .status(200)
    .json(
      await productService.getFilteredProducts({ metal_type, filter_category, product_type })
    );
});

export const getAllAdminProducts = asyncHandler(async (req, res) => {
  res.status(200).json(await productService.getAllAdminProducts());
});

export const getAllTypes = asyncHandler(async (req, res) => {
  // Type names, not products: nothing to rename.
  res.status(200).json(await productService.getAllTypes());
});

// `user`/`created_by` may still arrive in the body and are ignored: who made the edit is the session's, read off the connection by the audit_stamp trigger (migration 116) — a body field naming an author was a caller claiming to be somebody else.
export const saveProduct = asyncHandler(async (req, res) => {
  await productService.saveProduct({ product: req.body.product });
  res.status(200).json("Product updated.");
});

export const createProduct = asyncHandler(async (req, res) => {
  const created = await productService.createProduct({ name: req.body?.name });
  res.status(201).json(created);
});
