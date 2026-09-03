import re, glob, sys

def strip_scan(src, open_idx):
    """Return end index (exclusive) of the balanced call starting at '(' open_idx."""
    i = open_idx + 1; depth = 1
    while i < len(src) and depth > 0:
        ch = src[i]; nxt = src[i+1] if i+1 < len(src) else ""
        if ch == "/" and nxt == "/":
            while i < len(src) and src[i] != "\n": i += 1
            continue
        if ch == "/" and nxt == "*":
            i += 2
            while i < len(src) and not (src[i] == "*" and src[i+1:i+2] == "/"): i += 1
            i += 2; continue
        if ch == "(": depth += 1
        elif ch == ")": depth -= 1
        elif ch in "'\"`":
            q = ch; i += 1
            while i < len(src) and src[i] != q:
                if src[i] == "\\": i += 1
                i += 1
        i += 1
    return i  # index just after the closing ')'

FILES = sorted(f for f in glob.glob("**/*.test.ts", recursive=True) if "node_modules" not in f)
total = 0
touched = []
for f in FILES:
    src = open(f).read()
    out = src
    changed = 0
    # process from the end so indices stay valid
    hits = [m for m in re.finditer(r"inPinnedTransaction\s*\(", src)]
    for m in reversed(hits):
        open_idx = m.end() - 1
        end = strip_scan(src, open_idx)
        call = src[open_idx:end]           # "( ... )"
        if re.search(r"\bactor\s*:", call): continue
        inner = call[1:-1]
        # does it end with an options object literal?
        mo = re.search(r",\s*\{(?P<body>[^{}]*)\}\s*$", inner, re.S)
        if mo:
            new_inner = inner[:mo.start()] + ", { actor: TEST_ACTOR.id," + mo.group("body").rstrip().rstrip(",") + (" }" if mo.group("body").strip() else " }")
            # keep it simple and readable: rebuild as `, { actor: TEST_ACTOR.id, <body> }`
            body = mo.group("body").strip().rstrip(",")
            new_inner = inner[:mo.start()] + (", { actor: TEST_ACTOR.id, " + body + " }" if body else ", { actor: TEST_ACTOR.id }")
        else:
            new_inner = inner.rstrip() + ", { actor: TEST_ACTOR.id }"
        out = out[:open_idx] + "(" + new_inner + ")" + out[end:]
        src = out  # subsequent (earlier) matches use updated string; indices before open_idx unchanged
        changed += 1
    if changed:
        if "#shared/testing/actor.ts" in out:
            mi = re.search(r'import \{([^}]*)\} from "#shared/testing/actor\.ts";', out)
            have = [x.strip() for x in mi.group(1).split(",") if x.strip()]
            names = sorted(set(have) | {"TEST_ACTOR"})
            out = out[:mi.start()] + f'import {{ {", ".join(names)} }} from "#shared/testing/actor.ts";' + out[mi.end():]
        else:
            a = re.search(r'^import .*from "#shared/testing/(?:pinned-pool|locks|session|rollback)\.ts";\n', out, re.M)
            if not a:
                print("NO ANCHOR", f); continue
            out = out[:a.end()] + 'import { TEST_ACTOR } from "#shared/testing/actor.ts";\n' + out[a.end():]
        open(f, "w").write(out)
        touched.append((f, changed)); total += changed
for f, n in touched: print(f, n)
print(total, "calls in", len(touched), "files")
