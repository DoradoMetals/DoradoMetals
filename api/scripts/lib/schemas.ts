export const NATIVE_SCHEMAS = [
  "auth", "checkout", "fulfillments", "leads", "media", "metals",
  "orders", "organizations", "payments", "places", "products", "rates",
  "refiners", "reviews", "shipping", "spots", "tax",
];

const IGNORED = new Set(["exchange", "information_schema", "public"]);

export function unknownSchemas(present: string[]): string[] {
  const known = new Set(NATIVE_SCHEMAS);
  return present.filter(
    (s) => !s.startsWith("pg_") && !s.startsWith("zz_") && !IGNORED.has(s) && !known.has(s)
  );
}

type RowFetcher = (sql: string) => Promise<{ nspname: string }[]>;

export async function assertSchemasComplete(fetchRows: RowFetcher): Promise<void> {
  const rows = await fetchRows("SELECT nspname FROM pg_namespace");
  const unknown = unknownSchemas(rows.map((r) => r.nspname));
  if (unknown.length) {
    throw new Error(
      `NATIVE_SCHEMAS (api/scripts/lib/schemas.ts) does not list: ${unknown.join(", ")}`
    );
  }
}
