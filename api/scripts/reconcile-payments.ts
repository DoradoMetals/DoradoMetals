import '#env'
import pool from '#pool'
import * as orders from '#db/orders/repo.ts'
import { sweepSettledIntents, sweepAbandoned } from '#payments/sweeps.ts'

const COMMIT = process.argv.includes('--commit')
const ttlFlag = process.argv.indexOf('--ttl-hours')
const TTL_HOURS = ttlFlag >= 0 ? Number(process.argv[ttlFlag + 1]) : 24

if (!Number.isFinite(TTL_HOURS) || TTL_HOURS < 1) {
  console.error(`--ttl-hours must be a number >= 1, got ${process.argv[ttlFlag + 1]}`)
  process.exit(1)
}

{
  const u = process.env.DATABASE_URL ?? ''
  const m = u.match(/@([^/]+)\/([^?]+)/)
  console.log(`database: ${m ? `${m[2]} @ ${m[1]}` : '(unparsed DATABASE_URL)'}`)
  console.log(
    `mode: ${COMMIT ? 'COMMIT' : 'report only - nothing is written'}, ttl ${TTL_HOURS}h\n`
  )
}

try {
  const settled = await orders.findSalesAwaitingSettledIntent()
  console.log(`${settled.length} order(s) awaiting a payment that already settled`)
  for (const s of settled) console.log(`  ${s.order_id}  (${s.payment_intent_id})`)

  const abandoned = await orders.findAbandonedSales(TTL_HOURS)
  console.log(`${abandoned.length} order(s) past the ${TTL_HOURS}h TTL with no confirmed payment`)
  for (const a of abandoned) {
    const funds = a.used_funds
      ? ` - would refund ${Number(a.reserved_funds ?? 0)} of reserved credit`
      : ''
    console.log(
      `  ${a.order_id}  intent ${a.payment_intent_id ?? 'none'} (${a.payment_status ?? '-'})${funds}`
    )
  }

  if (!COMMIT) {
    console.log('\nreport only - re-run with --commit to advance and cancel.')
  } else {
    const advanced = await sweepSettledIntents()
    console.log(`\nadvanced ${advanced.filter((r) => r.outcome === 'advanced').length} order(s)`)
    const cancelled = await sweepAbandoned(TTL_HOURS)
    const refunded = cancelled.reduce((acc, r) => acc + r.refunded, 0)
    console.log(`cancelled ${cancelled.length} order(s), refunded ${refunded} of reserved credit`)
  }
} finally {
  await pool.end()
}
