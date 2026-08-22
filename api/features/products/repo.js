// Selects which schema the products feature reads and writes.
// Same three-phase pattern as leads - see api/features/leads/repo.js.
//
//   PRODUCTS_SOURCE=exchange   (default) read exchange, write exchange
//   PRODUCTS_SOURCE=dual                 read new,      write BOTH
//   PRODUCTS_SOURCE=next                 read new,      write new
//
// products.bullion names three columns differently - name, description and type
// where exchange has product_name, product_description and product_type - and
// the field lists in constants.bullion.js alias them back, so the wire shape is
// unchanged. The joins differ too: metals.metals calls its label column `name`,
// mints moved into the products schema, and a supplier is reassembled by
// refiners.exchange_compat.
//
// Gate on `pnpm --filter @dorado/api diff products` before promoting.
import * as exchange from "#features/products/repo.exchange.js";
import * as next from "#features/products/repo.next.js";
import * as dual from "#features/products/repo.dual.js";

const SOURCES = { exchange, dual, next };

const SOURCE = Object.hasOwn(SOURCES, process.env.PRODUCTS_SOURCE ?? "")
  ? process.env.PRODUCTS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getAllProducts = impl.getAllProducts;
export const getSellProducts = impl.getSellProducts;
export const getProductFromSlug = impl.getProductFromSlug;
export const getHomepageProducts = impl.getHomepageProducts;
export const getFilteredProducts = impl.getFilteredProducts;
export const getAllAdminProducts = impl.getAllAdminProducts;
export const getAdminProductById = impl.getAdminProductById;
export const getAllTypes = impl.getAllTypes;
export const getItemsFromIds = impl.getItemsFromIds;
export const updateProduct = impl.updateProduct;
export const insertProduct = impl.insertProduct;
