// What is left of the old string-substitution templates: the refiner's copy of
// a sales order, and the three auth mails the passwordless-auth lane will
// delete with the templates behind them. Every CUSTOMER mailer is built from
// the Figma page now - see templates/*.ts - and renders through
// render/base.ts rather than through [BODY] and [First Name].
import fs from 'fs'
import path from 'path'
import { formatSalesOrderNumber } from '#shared/utils/formatOrderNumbers.ts'
import { fileURLToPath } from 'url'
import type { OrderPricing, OrderView } from '@dorado/contracts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

type TemplateVars = {
  firstName?: string | null
  url?: string | null
}

function renderTemplate(contentFile: string, { firstName = 'there', url }: TemplateVars): string {
  const templatesDir = path.join(__dirname, '..', 'templates')

  const layoutPath = path.join(templatesDir, 'baseLayout.raw.html')
  const contentPath = path.join(templatesDir, contentFile)

  const layout = fs.readFileSync(layoutPath, 'utf8')
  const content = fs.readFileSync(contentPath, 'utf8')

  const safeUrl = url ?? 'https://www.doradometals.com'

  return layout
    .replace('[BODY]', content)
    .replace(/\[First Name\]/g, firstName ?? 'there')
    .replace(/\[URL\]/g, safeUrl)
}

export function renderResetPasswordEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate('resetPassword.raw.html', { firstName, url })
}

export function renderVerifyEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate('verifyEmail.raw.html', { firstName, url })
}

export function renderChangeEmail({ firstName, url }: TemplateVars): string {
  return renderTemplate('changeEmail.raw.html', { firstName, url })
}

type RefinerEmailInput = {
  firstName?: string | null
  url?: string | null
  order: OrderView
  pricing: OrderPricing
}

const orDash = (value: string | null | undefined): string =>
  value == null || value === '' ? '&mdash;' : value

const money = (value: number | null | undefined): string =>
  value == null ? '&mdash;' : `$${value.toFixed(2)}`

export function renderSalesOrderToSupplierEmail({
  firstName,
  url,
  order,
  pricing,
}: RefinerEmailInput): string {
  const templatesDir = path.join(__dirname, '..', 'templates')
  const layoutPath = path.join(templatesDir, 'baseLayout.raw.html')
  const contentPath = path.join(templatesDir, 'salesOrderToSupplier.raw.html')
  const layout = fs.readFileSync(layoutPath, 'utf8')
  let content = fs.readFileSync(contentPath, 'utf8')

  content = content
    .replace(/\[First Name\]/g, firstName ?? 'there')
    .replace(/href=""/g, `href="${url ?? ''}"`)

  const addr = order.address
  const shippingHtml = [
    `<tr><td style="padding:4px 8px;"><strong>Street 1:</strong> ${orDash(addr?.line_1)}</td></tr>`,
    addr?.line_2 &&
      `<tr><td style="padding:4px 8px;"><strong>Street 2:</strong> ${addr.line_2}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>City:</strong> ${orDash(addr?.city)}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>State:</strong> ${orDash(addr?.state)}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>Zip Code:</strong> ${orDash(addr?.zip)}</td></tr>`,
  ]
    .filter(Boolean)
    .join('')

  // The order's own metals, in the SQL read's order, priced the way every line
  // on the order is priced (ruling 78 - no asks Map, no per-line index).
  const spotsHtml = pricing.spots
    .map(
      (spot) => `
    <tr>
      <td style="padding:4px 8px;">${spot.metal_id}</td>
      <td style="padding:4px 8px;text-align:right;">
        ${money(spot.ask)}
      </td>
    </tr>
  `
    )
    .join('')

  const orderRows = order.items
    .filter((line) => line.bullion_id !== null)
    .map((line) => {
      const priced = pricing.items.find((p) => p.id === line.id)
      const subtotal = (priced?.line_total ?? 0).toFixed(2)
      return `
      <tr>
        <td style="padding:8px 0">${line.product_name ?? ''}</td>
        <td style="padding:8px 0;text-align:center">${line.quantity}</td>
        <td style="padding:8px 0;text-align:right">$${subtotal}</td>
      </tr>
    `
    })
    .join('')

  const total = (order.totals?.items ?? 0).toFixed(2)

  content = content
    .replace('[SHIPPING_ROWS]', shippingHtml)
    .replace('[SPOTS_ROWS]', spotsHtml)
    .replace('[ORDER_ROWS]', orderRows)
    .replace('[ORDER_TOTAL]', total)
    .replace('[ORDER_NUMBER]', formatSalesOrderNumber(order.order.number))
    .replace('[CUSTOMER_NAME]', order.user?.name ?? '')

  return layout.replace('[BODY]', content)
}
