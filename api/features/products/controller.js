// Every response goes through toProductWire, which converts the new shape back
// to the names the frontend reads today. It is a rename and nothing else, and
// PRODUCTS_WIRE=next turns it off - see features/products/wire.js.
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as productService from "#features/products/service.js";
import { toProductWire, fromProductWire } from "#features/products/wire.js";

export const getAllProducts = asyncHandler(async (req, res) => {
  res.status(200).json(toProductWire(await productService.getAllProducts()));
});

export const getSellProducts = asyncHandler(async (req, res) => {
  res.status(200).json(toProductWire(await productService.getSellProducts()));
});

export const getProductFromSlug = asyncHandler(async (req, res) => {
  const rows = await productService.getProductFromSlug(req.query.slug);
  if (rows.length === 0) {
    return res.status(404).json({ message: "Not found" });
  }
  res.status(200).json(toProductWire(rows));
});

export const getHomepageProducts = asyncHandler(async (req, res) => {
  res.status(200).json(toProductWire(await productService.getHomepageProducts()));
});

export const getFilteredProducts = asyncHandler(async (req, res) => {
  const { metal_type, filter_category, product_type } = req.query;
  res
    .status(200)
    .json(
      toProductWire(
        await productService.getFilteredProducts({ metal_type, filter_category, product_type })
      )
    );
});

export const getAllAdminProducts = asyncHandler(async (req, res) => {
  res.status(200).json(toProductWire(await productService.getAllAdminProducts()));
});

export const getAllTypes = asyncHandler(async (req, res) => {
  // Type names, not products: nothing to rename.
  res.status(200).json(await productService.getAllTypes());
});

export const saveProduct = asyncHandler(async (req, res) => {
  await productService.saveProduct({
    product: fromProductWire(req.body.product),
    user: req.body.user,
  });
  res.status(200).json("Product updated.");
});

export const createProduct = asyncHandler(async (req, res) => {
  const created = await productService.createProduct(fromProductWire(req.body));
  res.status(201).json(created);
});
