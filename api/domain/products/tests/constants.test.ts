// The projections that decide what leaves the API for a product. domain/products/constants.ts survives because checkout still imports it; goes when checkout is restructured.
// The hazard: a projection that silently grows a column is how columns leak onto the wire. validate:wire only catches drift that reaches a contract shape; this catches list/alias drift and an admin-only column appearing in a public list.
import { test } from "vitest";
import assert from "node:assert/strict";
import path from "node:path";
import * as exchange from "#domain/products/constants.ts";
import { sqlFrom } from "#shared/db/sql.ts";

// The statements are db/products/sql; this test stayed in domain/ alongside constants.ts.
const sql = sqlFrom(path.join(import.meta.dirname, "..", "..", "..", "db", "products"));

// The name a field arrives under: the alias if there is one, else the column.
const projected = (text: string): string[] =>
  text
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean)
    .map((part: string) => {
      const alias = part.match(/\bAS\s+(\w+)/i);
      // `?? part`: String.pop() on a split is typed `| undefined` but can't actually be, for a non-empty split — this beats a non-null assertion.
      const name = alias ? alias[1] : (part.split(/\s+/).pop() ?? part);
      return name.split(".").pop() ?? name;
    });

// The SELECT list of a statement, comment-stripped — these files' headers name columns in prose, and matching those would be matching a comment.
const selected = (name: string): string[] => {
  const body = sql(name)
    .split("\n")
    .filter((l: string) => !l.trim().startsWith("--"))
    .join("\n");
  const m = body.match(/SELECT\s+(?:DISTINCT\s+)?([\s\S]*?)\n\s*FROM/i);
  assert.ok(m, `${name} has no SELECT ... FROM`);
  return projected(m[1]);
};

// The two ids every public statement projects for compose.ts and the wire never
// sees, and the third the admin statements add.
const COMPOSE_ONLY = ["metal_id", "mint_id", "supplier_id"];
const withoutComposeIds = (fields: string[]) => fields.filter((f) => !COMPOSE_ONLY.includes(f));

const PUBLIC_STATEMENTS = [
  "get_storefront", "get_sell", "get_homepage", "get_by_slug",
  "get_by_ids", "get_filtered",
];
const ADMIN_STATEMENTS = ["get_admin_all", "get_admin_one"];

const PAIRS = [
  ["PRODUCT_FIELDS", exchange.PRODUCT_FIELDS, exchange.PRODUCT_FIELDS_WITH_ALIAS],
  ["ADMIN_PRODUCT_FIELDS", exchange.ADMIN_PRODUCT_FIELDS, exchange.ADMIN_PRODUCT_FIELDS_WITH_ALIAS],
];

test("the lists are real, so nothing below passes by reading an empty string", () => {
  for (const [name, plain, alias] of PAIRS) {
    assert.ok(projected(plain).length >= 15, `${name} projects only ${projected(plain).length} field(s)`);
    assert.ok(projected(alias).length >= 15, `${name}_WITH_ALIAS projects only ${projected(alias).length}`);
  }
  for (const n of [...PUBLIC_STATEMENTS, ...ADMIN_STATEMENTS]) {
    assert.ok(selected(n).length >= 15, `${n} projects only ${selected(n).length} field(s)`);
  }
});

for (const [name, plain, alias] of PAIRS) {
  test(`${name} and its alias twin project the same fields, in the same order`, () => {
    assert.deepEqual(projected(alias), projected(plain));
  });
}

// Every public statement returns the SAME shape. Six statements differ only in their WHERE clause; one growing a column is exactly how a field reaches some responses and not others, which no contract check would catch (it would still parse).
test("every public statement projects the same fields, in the same order", () => {
  const first = selected(PUBLIC_STATEMENTS[0]);
  for (const n of PUBLIC_STATEMENTS.slice(1)) {
    assert.deepEqual(selected(n), first, `${n} projects a different shape from get_storefront`);
  }
});

test("both admin statements project the same fields, in the same order", () => {
  assert.deepEqual(selected("get_admin_one"), selected("get_admin_all"));
});

// The disclosure boundary. Whatever else changes, the public list must not
// acquire a field the admin list keeps to itself.
const ADMIN_ONLY = [
  "created_at", "created_by", "display", "filter_category",
  "homepage_display", "quantity", "stock", "updated_at", "updated_by",
];

for (const [label, pub, adm] of [
  ["exchange", projected(exchange.PRODUCT_FIELDS), projected(exchange.ADMIN_PRODUCT_FIELDS)],
  ["bullion", withoutComposeIds(selected("get_storefront")), withoutComposeIds(selected("get_admin_all"))],
]) {
  test(`${label}: everything public is also admin, and nine fields are admin-only`, () => {
    const p = new Set(pub);
    const a = new Set(adm);
    assert.deepEqual([...p].filter((f) => !a.has(f)), [], "a public field is not in the admin list");
    assert.deepEqual([...a].filter((f) => !p.has(f)).sort(), ADMIN_ONLY);
  });
}

// exchange and products.bullion select from differently named columns (product_name vs name) but must deliver the same shape — one contract describes both, and validate:wire parses each through it.
test("the exchange list and the bullion statements deliver the same shape", () => {
  assert.deepEqual(
    withoutComposeIds(selected("get_storefront")),
    projected(exchange.PRODUCT_FIELDS)
  );
  assert.deepEqual(
    withoutComposeIds(selected("get_admin_all")),
    projected(exchange.ADMIN_PRODUCT_FIELDS)
  );
  // And they really are different underneath, or the check above is trivial.
  assert.match(exchange.PRODUCT_FIELDS, /product_name AS name/);
  const storefront = sql("get_storefront");
  assert.doesNotMatch(storefront, /product_name/);
});

// The three ids are projected for compose.ts and must not survive it. This is
// the half of the boundary the statements cannot state on their own.
test("the compose-only ids are projected, and only those three", () => {
  const publicIds = selected("get_storefront").filter((f) => COMPOSE_ONLY.includes(f));
  assert.deepEqual(publicIds, ["metal_id", "mint_id"],
    "the public statements project supplier_id - a refiner is not a public fact");
  assert.deepEqual(
    selected("get_admin_all").filter((f) => COMPOSE_ONLY.includes(f)).sort(),
    ["metal_id", "mint_id", "supplier_id"]
  );
});
