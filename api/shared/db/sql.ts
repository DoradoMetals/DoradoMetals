// SQL loaded from .sql files rather than written as strings in TypeScript — a query in a template literal gets no syntax highlighting, formatting or linting from any tool.
// Lazy and cached: read on first use, so an unused module costs nothing and a missing file fails at the call site with its name, not at boot.
// Fails loudly on empty too — `query("")` isn't an error to pg, it just does nothing, so a truncated file would silently return no rows.
import fs from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

/**
 * Binds a loader to a directory, so a repo reads its own statements by name:
 *
 *   const sql = sqlFrom(import.meta.dirname);
 *   await query(sql("get_one"), [id], executor);
 *
 * The name is a file name without the extension. Directories are allowed, so
 * `sql("legacy/create")` reads `legacy/create.sql`.
 */
export function sqlFrom(dir: string): (name: string) => string {
  return (name: string): string => {
    const file = path.join(dir, "sql", `${name}.sql`);
    const hit = cache.get(file);
    if (hit !== undefined) return hit;

    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      throw new Error(
        `no SQL file at ${file} - sqlFrom(import.meta.dirname) reads <dir>/sql/<name>.sql`
      );
    }

    // An empty or comment-only file is a query that does nothing, and pg will
    // not complain about it. Refuse rather than run it.
    const withoutComments = text
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim();
    if (withoutComments === "") {
      throw new Error(`${file} contains no SQL - only comments or whitespace`);
    }

    cache.set(file, text);
    return text;
  };
}
