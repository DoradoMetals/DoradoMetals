import re, glob, os, sys

files = [f for f in glob.glob("**/*.test.ts", recursive=True) if "node_modules" not in f]
DEF_RE = re.compile(r"\nasync function inRollback\(fn: \(c: PoolClient\) => Promise<void>\) \{\n(?P<body>[\s\S]*?)\n\}\n")
changed = []
skipped = []

for f in files:
    src = open(f).read()
    m = DEF_RE.search(src)
    if not m:
        continue
    body = m.group("body")
    # what lock did the local one take?
    lm = re.search(r"takeLocks\(client,\s*(.+?)\);", body)
    lock = lm.group(1).strip() if lm else None
    # any comment lines inside the body that carry meaning
    comments = [l for l in body.split("\n") if l.strip().startswith("//")]

    rest = src[:m.start()] + src[m.end():]
    # is `client` still used?
    uses = len(re.findall(r"\bclient\b", rest))

    new_decl = ""
    if lock:
        note = ("\n".join(comments) + "\n") if comments else ""
        new_decl = (
            "\n// THE FILE'S LOCK, BOUND ONCE. A lock is a property of what this file\n"
            "// WRITES, not of one call, so it is named here and every inRollback below\n"
            "// inherits it - which is also what stops a new test being added without one.\n"
            + note +
            f"const inRollback = rollbackIn({{ lock: {lock} }});\n"
        )
    src = rest
    if new_decl:
        # place it where the definition was
        src = src[:m.start()] + new_decl + src[m.start():]

    # imports
    imp = ("rollbackIn" if lock else "inRollback")
    if 'from "#shared/testing/rollback.ts"' not in src:
        # insert after the pool import or the locks import
        anchor = re.search(r'^import .*from "#shared/testing/locks\.ts";\n', src, re.M) \
              or re.search(r'^import pool from "#db";\n', src, re.M) \
              or re.search(r'^import type \{ PoolClient \} from "pg";\n', src, re.M)
        if not anchor:
            skipped.append((f, "no anchor for the import"))
            continue
        src = src[:anchor.end()] + f'import {{ {imp} }} from "#shared/testing/rollback.ts";\n' + src[anchor.end():]

    open(f, "w").write(src)
    changed.append((f, lock, uses))

for f, lock, uses in changed:
    print(f"{f}  lock={lock}  client-uses-left={uses}")
print(f"\n{len(changed)} converted, {len(skipped)} skipped")
for f, why in skipped: print("  skip", f, why)
