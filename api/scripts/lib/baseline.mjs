// Which migrations a baseline migration subsumes.
//
// A baseline reproduces the schema as of some range of migrations, so those
// must be recorded as applied rather than replayed. 000_genesis_schema.sql is
// generated from a dev database that already ran 002 through 028, so it creates
// the tables in their post-028 shape; running those again on top would fail on
// the first ALTER TABLE ADD CONSTRAINT, which Postgres has no IF NOT EXISTS for.
//
// Expressed as a range rather than a ceiling because 001 indexes foreign keys
// on exchange, and a production database still wants those - it is only the
// migrations shaping the new schema that the baseline covers.
//
// Kept out of migrate.mjs so it can be tested without a database.

// Returns { from, through } or null.
export function parseBaseline(sql) {
  const m = sql.match(/^\s*--\s*baseline:\s*(\d+)-(\d+)/m);
  return m ? { from: m[1], through: m[2] } : null;
}

// The files a baseline covers: everything in range, except itself and anything
// already applied. Compared as zero-padded strings, which is how the filenames
// sort and how the runner orders them.
export function coveredBy(baseline, self, files, applied = new Set()) {
  if (!baseline) return [];
  const { from, through } = baseline;
  return files.filter((f) => {
    if (f.name === self) return false;
    if (applied.has(f.name)) return false;
    const num = f.name.slice(0, from.length);
    return /^\d+$/.test(num) && num >= from && num <= through;
  });
}
