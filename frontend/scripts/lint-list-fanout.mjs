// Components rendered once per row that fetch their own data.
//
// THE DEFECT THIS LOOKS FOR (D111). The resource split is safe because its
// reads are parallel, constant-count per view, keyed by an id the client
// already holds, and cacheable. A LIST BREAKS THE SECOND PROPERTY: fifty order
// rows each calling useFulfillment(order.id) is fifty requests where the page
// needed one, and it is precisely the shape D101 just fixed on the server —
// `assemble()` looping per order at 130ms a round trip, 38 seconds for one
// list.
//
// The client version is less catastrophic (the browser fires them in parallel,
// so it is fifty concurrent requests rather than fifty serial ones) and more
// insidious: nothing fails, nothing is slow in dev with tens of rows, and the
// symptom only appears as production row counts arriving at a page nobody
// measured. Exactly the way `audit:indexes` describes a lost index.
//
// WHY ESLINT DOES NOT CATCH IT. A hook inside `.map()` is already a
// rules-of-hooks violation and lint finds that. The real shape is LEGAL React:
// a Row component that calls a data hook keyed by its own props, rendered from
// a `.map()` in its parent. Two files, both individually correct.
//
// THE RULE (D111): LIST READS RETURN ROWS. Per-resource reads belong to the
// DETAIL view. If a row wants a sub-resource, add the column to the list read —
// do not fan out.
//
// WHAT IT CANNOT SEE, stated plainly because a detector's blind spot reports as
// clean code (D95/D99/D108, and this script's own sibling shipped with exactly
// that bug): it matches a component rendered in a `.map()` in the same file or
// imported by name, and a data hook called in that component's body. A row
// rendered through a generic table's `columns` config, or a hook called two
// components deep, is invisible to it. A clean report means "none of the shapes
// I recognise", never "none exist".
//
//   node scripts/lint-list-fanout.mjs [--self-test] [--json]

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

// Hooks that fetch. Not every use* — a useState in a row is fine, and flagging
// it would bury the finding.
// THE HOOK MUST TAKE AN ARGUMENT, and that is the whole distinction.
//
// `useSpotPrices()` with no argument is ONE query key, so React Query dedupes
// it: fifty product cards calling it make ONE request. That is the "cacheable"
// property in D111 working exactly as designed, and flagging it would bury the
// real finding under six false ones - which is what the first version of this
// script did.
// `useFulfillment(order.id)` is a DIFFERENT KEY PER ROW. Fifty rows, fifty
// requests, no dedupe. That is the defect.
const FETCHING_HOOK = /\buse[A-Z]\w*\s*\(\s*[^)\s]/g
const NON_FETCHING = new Set([
  'useState',
  'useEffect',
  'useMemo',
  'useCallback',
  'useRef',
  'useContext',
  'useReducer',
  'useId',
  'useRouter',
  'usePathname',
  'useSearchParams',
  'useForm',
  'useFormContext',
  'useWatch',
  'useFieldArray',
  'useTheme',
  'useMediaQuery',
  'useIsMobile',
  'useDebounce',
  'useLayoutEffect',
  'useTransition',
  'useQueryClient',
  'useMutation',
])

// Mutations are not fetches - they fire on a click, not on render, so one per
// row costs nothing. Stores are not fetches either.
const NOT_A_FETCH =
  /^use(?:Create|Update|Delete|Patch|Add|Remove|Set|Save|Send|Submit|Toggle)[A-Z]|Store$|Mutation$/

// Rows that legitimately fetch, each with the reason. Pinned from both sides:
// an unaccepted finding fails, and an entry that stops reporting is called out
// so a fixed component cannot leave a stale excuse behind.
const ACCEPTED = {
  // "Component": "why one request per row is right here",
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'test-results' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e.endsWith('.tsx')) out.push(p)
  }
  return out
}

// Components rendered inside a .map() callback: `.map((x) => <Row ... />)` and
// the block-bodied form that returns one.
function renderedInLists(src) {
  const names = new Set()
  const re = /\.map\s*\(\s*\(?[^)]*\)?\s*=>\s*\{?[\s\S]{0,400}?<([A-Z]\w+)/g
  let m
  while ((m = re.exec(src))) names.add(m[1])
  return names
}

// Data hooks called in a component's own body.
function fetchingHooksIn(src, component) {
  const start = new RegExp(
    `(?:function\\s+${component}\\b|const\\s+${component}\\s*[:=][^=]*=>|const\\s+${component}\\s*=\\s*function)`
  ).exec(src)
  if (!start) return []
  // Body ends at the next top-level component declaration, or EOF.
  const rest = src.slice(start.index)
  const next = /\n(?:export\s+)?(?:function\s+[A-Z]|const\s+[A-Z]\w*\s*[:=])/.exec(rest.slice(1))
  const body = next ? rest.slice(0, next.index + 1) : rest
  const found = new Set()
  for (const h of body.matchAll(FETCHING_HOOK)) {
    // Take the identifier only. `.replace(/\s*\(.*$/)` left a newline and the
    // first argument attached when a call spanned lines.
    const name = /^use[A-Z]\w*/.exec(h[0])[0]
    if (NON_FETCHING.has(name) || NOT_A_FETCH.test(name)) continue
    found.add(name)
  }
  return [...found]
}

if (process.argv.includes('--self-test')) {
  const parent = `
    export const List = ({ orders }) => (
      <tbody>{orders.map((o) => <OrderRow key={o.id} order={o} />)}</tbody>
    );`
  const child = `
    export const OrderRow = ({ order }) => {
      const [open, setOpen] = useState(false);
      const { data } = useFulfillment(order.id);
      const { data: spots } = useSpotPrices();
      const save = useUpdateOrder();
      return <tr>{data?.status}</tr>;
    };`
  const listed = renderedInLists(parent)
  if (!listed.has('OrderRow')) {
    console.error('SELF-TEST FAILED: did not see OrderRow in the map')
    process.exit(1)
  }
  const hooks = fetchingHooksIn(child, 'OrderRow')
  if (!hooks.includes('useFulfillment')) {
    console.error(`SELF-TEST FAILED: hooks ${hooks}`)
    process.exit(1)
  }
  if (hooks.includes('useState')) {
    console.error('SELF-TEST FAILED: useState must not count as fetching')
    process.exit(1)
  }
  if (hooks.includes('useSpotPrices')) {
    console.error('SELF-TEST FAILED: an argument-less hook dedupes and must not flag')
    process.exit(1)
  }
  if (hooks.includes('useUpdateOrder')) {
    console.error('SELF-TEST FAILED: a mutation must not flag')
    process.exit(1)
  }
  console.log('self-test ok: flags a per-row-keyed fetch, and ignores useState,')
  console.log('an argument-less (deduped) query, and a mutation.')
  process.exit(0)
}

const files = walk(ROOT).filter((f) => !f.includes('/scripts/'))
const byName = new Map()
for (const f of files) byName.set(basename(f, '.tsx'), f)

const listed = new Map() // component -> file that renders it in a list
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const name of renderedInLists(src)) if (!listed.has(name)) listed.set(name, f)
}

if (!files.length || !listed.size) {
  console.error('REFUSING TO REPORT: found no component rendered inside a .map().')
  console.error('A scan that recognises nothing looks exactly like a codebase with no lists.')
  process.exit(1)
}

const findings = []
for (const [name, renderedBy] of listed) {
  // Where is it defined? Its own file, or the file that renders it.
  const defFile = byName.get(name) ?? renderedBy
  const hooks = fetchingHooksIn(readFileSync(defFile, 'utf8'), name)
  if (hooks.length) findings.push({ name, defFile, renderedBy, hooks })
}

const unaccepted = findings.filter((f) => !ACCEPTED[f.name])
const accepted = findings.filter((f) => ACCEPTED[f.name])

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ scanned: files.length, listed: listed.size, findings }, null, 2))
  process.exit(unaccepted.length ? 1 : 0)
}

console.log(`${files.length} .tsx scanned; ${listed.size} component(s) rendered inside a .map()\n`)

if (accepted.length) {
  console.log(`${accepted.length} accepted:`)
  for (const a of accepted) console.log(`  ok ${a.name} — ${ACCEPTED[a.name]}`)
  console.log('')
}

const stale = Object.keys(ACCEPTED).filter((k) => !findings.some((f) => f.name === k))
if (stale.length) {
  console.log(`${stale.length} ACCEPTED entr(ies) no longer report — remove them:`)
  for (const s of stale) console.log(`  - ${s}`)
  console.log('')
}

if (!unaccepted.length) {
  console.log('no row component fetches its own data.')
  process.exit(stale.length ? 1 : 0)
}

console.log(`${unaccepted.length} row component(s) fetch per row:\n`)
for (const f of unaccepted) {
  console.log(`  ${f.name}  ${f.hooks.join(', ')}`)
  console.log(`      defined  ${relative(ROOT, f.defFile)}`)
  console.log(`      listed   ${relative(ROOT, f.renderedBy)}`)
}
console.log('\n  One request per row is the client-side shape of D101. The fix is to add')
console.log('  the column to the LIST read, not to fetch from the row — D111 in FOLLOWUPS.md.')
process.exit(1)
