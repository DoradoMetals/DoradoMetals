import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.env.LINT_CONTRACTS_ROOT
  ? path.resolve(process.env.LINT_CONTRACTS_ROOT)
  : path.resolve(import.meta.dirname, '..', '..', 'packages', 'contracts', 'src')

const START = '// generated:start'
const END = '// generated:end'

const COMPUTED: Record<string, string> = {
  'pricing/quotes.ts':
    'the priced views the pricing SQL returns - a quote is ' +
    'computed from five tables and stored in none',
  'pricing/profit.ts':
    "the margin split three ways across an order, its refiner's " +
    'assay and two spot feeds - rows now, not a per-metal dictionary, but still ' +
    'a shape no table holds',
  'computed/providers.ts': 'the carrier catalogue the provider adapter assembles',
  'computed/orders.ts':
    'what an order may have done to it - booleans derived ' + 'from five tables and stored in none',
  'computed/fulfillments.ts':
    'how an order is handed over, and what may be ' +
    'done about it - four tables composed and no table backing the answer',
  'computed/shipping.ts':
    "a parcel's progress timeline, derived from scan " + 'rows, and what may be done to the parcel',
  'computed/rates.ts':
    "the rates page's bands - a volume label and a " +
    'cross-metal column key, neither of them a column',
  'computed/places.ts':
    'what may be done to an address book entry, and the ' +
    "places provider's suggestions - no table holds either",
  'computed/documents.ts':
    'what one mailer prints - a label/value row, a summary ' +
    'card and the copy slots the Figma mailers expose; no table holds a rendered line',
  'computed/auth.ts':
    'the passwordless surface - the bodies a caller sends and ' +
    'the masked verification, confirmation and session views; a code, a captcha token and a ' +
    'masked destination are none of them columns',
  'computed/crm.ts':
    "the provider's own webhook bodies and the customer " +
    'timeline - Twilio field names on the way in, three tables merged on the way out',
}

const FILE_FLOOR = 60

const walk = (dir: string, base = dir): string[] => {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full, base))
    else if (e.name.endsWith('.ts')) out.push(path.relative(base, full).split(path.sep).join('/'))
  }
  return out.sort()
}

const blankRegions = (text: string): string => {
  let out = ''
  let i = 0
  for (;;) {
    const a = text.indexOf(START, i)
    if (a === -1) return out + text.slice(i)
    const b = text.indexOf(END, a)
    const stop = b === -1 ? text.length : b + END.length
    out += text.slice(i, a) + text.slice(a, stop).replace(/[^\n]/g, ' ')
    i = stop
  }
}

const LEAF =
  /\bz\.(string|number|boolean|bigint|date|symbol|literal|enum|nativeEnum|unknown|any|never|void|null|undefined|nan|file|coerce|instanceof|custom|iso|uuid|email|url|int32|int64|float32|float64|stringbool)\b/

type Finding = { file: string; line: number; field: string; text: string }

function properties(
  src: string,
  open: number
): { props: { key: string; value: string }[]; end: number } | null {
  let depth = 0
  let i = open
  let quote: string | null = null
  const parts: string[] = []
  let cur = ''
  for (; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      if (ch === '\\') {
        cur += ch + (src[i + 1] ?? '')
        i++
        continue
      }
      if (ch === quote) quote = null
      cur += ch
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      cur += ch
      continue
    }
    if (ch === '{' || ch === '(' || ch === '[') {
      depth++
      if (depth === 1 && ch === '{') continue
      cur += ch
      continue
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      depth--
      if (depth === 0) {
        parts.push(cur)
        break
      }
      cur += ch
      continue
    }
    if (ch === ',' && depth === 1) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (depth !== 0) return null
  const props: { key: string; value: string }[] = []
  for (const raw of parts) {
    const p = raw
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
    if (!p) continue
    const c = p.indexOf(':')
    if (c === -1) {
      props.push({ key: p, value: p })
      continue
    }
    props.push({ key: p.slice(0, c).trim(), value: p.slice(c + 1).trim() })
  }
  return { props, end: i }
}

function scan(file: string, text: string): Finding[] {
  const found: Finding[] = []
  const src = blankRegions(text)
  const re = /\bz\.(object|looseObject)\s*\(\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const open = src.indexOf('{', m.index + m[0].length - 1)
    const parsed = properties(src, open)
    if (!parsed) continue
    for (const { key, value } of parsed.props) {
      if (!LEAF.test(value)) continue
      found.push({
        file,
        line: src.slice(0, open).split('\n').length,
        field: key,
        text: value.replace(/\s+/g, ' ').slice(0, 70),
      })
    }
  }
  return found
}

if (process.argv.includes('--self-test')) {
  const { selfTest } = await import('./lib/self-test-harness.ts')
  const region = (body: string) =>
    `${START}\nimport { z } from "zod/v4";\n\nexport const Row = z.object({\n  "id": z.string().uuid(),\n  "qty": z.number(),\n});\nexport type Row = z.infer<typeof Row>;\n${END}\n${body}`
  const filler: Record<string, string> = {}
  for (let i = 0; i < FILE_FLOOR; i++) filler[`filler/t${i}.ts`] = region('')
  for (const rel of Object.keys(COMPUTED)) {
    filler[rel] = `import { z } from "zod/v4";\nexport const X = z.object({ a: z.string() });\n`
  }
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: 'a hand-written field list outside the region is seen',
        rootEnv: 'LINT_CONTRACTS_ROOT',
        files: {
          ...filler,
          'orders/items.ts': region(
            `export const Bad = z.object({ id: z.string().uuid(), qty: z.number() });`
          ),
        },
        expect: 'fail',
        mustPrint: 'declares its own field',
      },
      {
        name: 'the same fields composed from the Row pass',
        rootEnv: 'LINT_CONTRACTS_ROOT',
        files: {
          ...filler,
          'orders/items.ts': region(
            `export const Good = z.object({ id: Row.shape.id, qty: Row.shape.qty });`
          ),
        },
        expect: 'pass',
        mustPrint: 'derive from a row',
      },
      {
        name: 'the SAME literal inside the generated region is left alone',
        rootEnv: 'LINT_CONTRACTS_ROOT',
        files: { ...filler, 'orders/items.ts': region('') },
        expect: 'pass',
      },
      {
        name: 'a leaf reached through .extend() is allowed',
        rootEnv: 'LINT_CONTRACTS_ROOT',
        files: {
          ...filler,
          'orders/items.ts': region(
            `export const Ok = Row.pick({ id: true }).extend({ weight: z.number() });`
          ),
        },
        expect: 'pass',
      },
      {
        name: 'an undeclared file under computed/ fails',
        rootEnv: 'LINT_CONTRACTS_ROOT',
        files: {
          ...filler,
          'computed/invented.ts': `import { z } from "zod/v4";\nexport const X = z.object({ a: z.string() });\n`,
        },
        expect: 'fail',
        mustPrint: 'not declared',
      },
      {
        name: 'a walk that opens too few files fails rather than reporting clean',
        rootEnv: 'LINT_CONTRACTS_ROOT',
        files: { 'orders/items.ts': region('') },
        expect: 'fail',
        mustPrint: 'floor',
      },
    ],
  })
}

const files = walk(ROOT)
if (files.length < FILE_FLOOR) {
  console.error(
    `only ${files.length} contract file(s) walked, floor is ${FILE_FLOOR} - a lint that ` +
      `opens nothing passes everything, so this is a broken walk, not a clean tree.`
  )
  process.exit(1)
}

const findings: Finding[] = []
const seenComputed = new Set<string>()

for (const rel of files) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  if (rel.startsWith('computed/') || rel.startsWith('pricing/')) {
    if (!(rel in COMPUTED)) {
      console.error(`${rel}: computed but not declared in this script's COMPUTED map.`)
      console.error(
        '  A shape no table backs needs a reason recorded beside it, not a directory to hide in.'
      )
      process.exit(1)
    }
    seenComputed.add(rel)
    if (!scan(rel, text).length) {
      console.error(`${rel}: declared in COMPUTED but derives from rows now - drop the entry.`)
      process.exit(1)
    }
    continue
  }
  findings.push(...scan(rel, text))
}

for (const rel of Object.keys(COMPUTED)) {
  if (seenComputed.has(rel)) continue
  console.error(
    `${rel}: declared in COMPUTED but no such file - an exclusion that outlives its subject excuses the next one.`
  )
  process.exit(1)
}

console.log(
  `${files.length} contract file(s) walked, ${Object.keys(COMPUTED).length} computed exception(s)`
)
if (findings.length) {
  console.log()
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}  \`${f.field}\` declares its own field: ${f.text}`)
  }
  console.log(
    `\n${findings.length} hand-written field(s). Compose from the entity's Row - ` +
      `\`Row.shape.<column>\` - or, for data no column holds, add it through .extend().`
  )
  process.exit(1)
}
console.log('every hand-written shape composes schemas that derive from a row')
