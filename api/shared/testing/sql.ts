// The statement loader a feature's unit test uses, spanning features/ and
// legacy/.
//
// WHY IT EXISTS. The dual-write mirrors moved to api/legacy/ in the 26c
// factoring (ruling 29: one directory to delete at promotion), and their .sql
// files went with them - features/x/sql/legacy/create.sql became
// legacy/x/sql/create.sql. The tests that pin those statements pin BOTH halves
// of a dual write in one file, deliberately: the whole point of the pin is that
// a hand-written parameter array matches a generated statement, and the two
// halves have to be compared against each other.
//
// So rather than split every such test in two, this loader understands the
// `legacy/` prefix the tests already spell and resolves it against the new
// root. The assertion strings are unchanged, and they still name what they pin.
//
// TEST-ONLY. Production code never reaches across the two roots: a repo in
// features/ loads its own sql/, a repo in legacy/ loads its own.
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/**
 * Binds a loader to a feature, reading `features/<feature>/sql/<name>.sql`
 * normally and `legacy/<feature>/sql/<name>.sql` for a `legacy/`-prefixed name.
 *
 *   const sql = sqlWithLegacy("media/images");
 *   sql("create");         // features/media/images/sql/create.sql
 *   sql("legacy/create");  // legacy/media/images/sql/create.sql
 */
export function sqlWithLegacy(feature: string): (name: string) => string {
  const live = sqlFrom(path.join(ROOT, "features", feature));
  const legacy = sqlFrom(path.join(ROOT, "legacy", feature));
  return (name: string): string =>
    name.startsWith("legacy/") ? legacy(name.slice("legacy/".length)) : live(name);
}
