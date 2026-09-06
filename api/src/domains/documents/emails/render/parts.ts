import { type, space, radius, width, fontStack, screen } from '#documents/theme.ts'
import type { MailerRow } from '@dorado/contracts'

// The five symbols of the Figma "Media" page, as table-based partials: Email
// Header (4:810), Email Footer (4:873), Email Code (5:109), Email Row (5:115)
// and Email Card (164:1151), plus the Button and Stat the mailers place beside
// them. Tables and inline styles only - Gmail strips <style> blocks and Outlook
// renders neither flex nor grid, so anything positional here has to be a cell.

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// A hosted absolute URL, never a data: URI or an attachment cid - both are
// blocked or stripped by at least one major client.
export const LOGO_URL = 'https://www.doradometals.com/icons/branding/full/full.png'
const SOCIAL_BASE = 'https://www.doradometals.com/icons/social_media/white'
const SITE = 'https://www.doradometals.com'

const micro = `font-family:${fontStack};font-size:${type.micro};line-height:${type.microLine};letter-spacing:${type.microTracking};font-weight:${type.regular};`
const small = `font-family:${fontStack};font-size:${type.small};line-height:${type.smallLine};font-weight:${type.medium};`

export function eyebrow(text: string): string {
  return `<div style="${micro}color:${screen.muted};text-align:center;">${esc(text)}</div>`
}

export function heading(text: string): string {
  return `<div style="font-family:${fontStack};font-size:${type.h3};line-height:${type.h3Line};letter-spacing:${type.h3Tracking};font-weight:${type.semibold};color:${screen.foreground};text-align:center;">${esc(text)}</div>`
}

export function lede(text: string): string {
  return `<div style="${micro}color:${screen.muted};text-align:center;">${esc(text)}</div>`
}

// The closing line is the one block the design sets flush left: it is an aside
// to the reader, not part of the announcement above it.
export function note(text: string): string {
  return `<div style="${micro}color:${screen.muted};text-align:left;">${esc(text)}</div>`
}

export function stat(label: string, value: string): string {
  return (
    `<div style="font-family:${fontStack};font-size:${type.small};line-height:${type.smallLine};letter-spacing:0.35px;color:${screen.muted};padding-bottom:${space.xs2};">${esc(label)}</div>` +
    `<div style="font-family:${fontStack};font-size:${type.h1};line-height:${type.h1Line};font-weight:${type.semibold};color:${screen.foreground};">${esc(value)}</div>`
  )
}

// Email Code (5:109). The code is TEXT and never an image: most clients block
// images by default, and the one thing this mailer exists to deliver would be
// the thing that did not arrive.
export function code(value: string, expiry: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${screen.card}" style="background-color:${screen.card};border:1px solid ${screen.border};border-radius:${radius};">
    <tr>
      <td align="center" style="padding:${space.lg};">
        <div style="font-family:${fontStack};font-size:${type.code};line-height:${type.codeLine};letter-spacing:${type.codeTracking};font-weight:${type.semibold};color:${screen.foreground};">${esc(value)}</div>
        <div style="${micro}color:${screen.muted};padding-top:${space.xs};">${esc(expiry)}</div>
      </td>
    </tr>
  </table>`
}

// Email Row (5:115) - label left, figure right, so a column of them reads down
// the right edge without a table of its own.
function row(entry: MailerRow): string {
  return `
    <tr>
      <td style="${micro}color:${screen.muted};padding:${space.xs} 0;text-align:left;">${esc(entry.label)}</td>
      <td style="${micro}color:${screen.foreground};padding:${space.xs} 0;text-align:right;">${esc(entry.value)}</td>
    </tr>`
}

function rule(): string {
  return `<tr><td colspan="2" height="1" style="height:1px;line-height:1px;font-size:0;background-color:${screen.border};">&nbsp;</td></tr>`
}

// Email Card (164:1151). Fewer than three rows is expected - the design says
// so - and an empty list renders nothing at all rather than an empty box.
export function card(rows: MailerRow[]): string {
  if (rows.length === 0) return ''
  const body = rows.map((entry, i) => (i === 0 ? row(entry) : rule() + row(entry))).join('')
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${screen.card}" style="background-color:${screen.card};border:1px solid ${screen.border};border-radius:${radius};">
    <tr>
      <td style="padding:${space.xs2} 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
      </td>
    </tr>
  </table>`
}

export function button(label: string, href: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td bgcolor="${screen.primary}" style="background-color:${screen.primary};border-radius:${radius};">
        <a href="${esc(href)}" target="_blank" style="display:inline-block;${small}color:${screen.onPrimary};text-decoration:none;padding:10px ${space.md};line-height:20px;">${esc(label)}</a>
      </td>
    </tr>
  </table>`
}

// Email Header (4:810). The white mark on our own dark ground, deliberately.
export function header(): string {
  return `
  <tr>
    <td align="center" bgcolor="${screen.background}" style="background-color:${screen.background};padding:${space.xl};">
      <a href="${SITE}" target="_blank" style="text-decoration:none;">
        <img src="${LOGO_URL}" width="160" alt="Dorado Metals Exchange" style="display:block;width:160px;max-width:160px;height:auto;border:0;" />
      </a>
    </td>
  </tr>`
}

function socialIcon(name: string, href: string, alt: string): string {
  return `<td style="padding:0 ${space.xs};"><a href="${href}" target="_blank" style="text-decoration:none;"><img src="${SOCIAL_BASE}/${name}.png" width="16" height="16" alt="${alt}" style="display:block;width:16px;height:16px;border:0;" /></a></td>`
}

// Email Footer (4:873). The POSTAL ADDRESS is not decoration - CAN-SPAM
// requires it on commercial mail and the safe habit is to carry it on
// transactional mail too. Unsubscribe leads to notification preferences and
// NOT to a blanket opt-out: nobody may opt out of the code that signs them in
// or the receipt for money they were paid.
export function footer(): string {
  return `
  <tr>
    <td bgcolor="${screen.background}" style="background-color:${screen.background};padding:0 ${space.xl} ${space.xl} ${space.xl};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td height="1" style="height:1px;line-height:1px;font-size:0;background-color:${screen.border};">&nbsp;</td></tr>
        <tr>
          <td align="center" style="padding-top:${space.md};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              ${socialIcon('instagram', 'https://www.instagram.com/doradometals/', 'Instagram')}
              ${socialIcon('facebook', 'https://www.facebook.com/people/Dorado-Metals/61576361032653/', 'Facebook')}
              ${socialIcon('x', 'https://x.com/DoradoMetals', 'X')}
            </tr></table>
          </td>
        </tr>
        <tr>
          <td align="center" style="${micro}color:${screen.muted};padding-top:${space.md};">
            Dorado Metals Exchange &middot; 3198 Royal Lane, Suite 209, Dallas, Texas 75229
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:${space.md};">
            <a href="${SITE}/privacy-policy" target="_blank" style="${small}color:${screen.foreground};text-decoration:none;">Privacy</a>
            <span style="${small}color:${screen.muted};">&nbsp;&nbsp;</span>
            <a href="${SITE}/terms-and-conditions" target="_blank" style="${small}color:${screen.foreground};text-decoration:none;">Terms</a>
            <span style="${small}color:${screen.muted};">&nbsp;&nbsp;</span>
            <a href="${SITE}/account?tab=notifications" target="_blank" style="${small}color:${screen.foreground};text-decoration:none;">Unsubscribe</a>
          </td>
        </tr>
        <tr>
          <td align="center" style="${micro}color:${screen.muted};padding-top:${space.md};">
            You&rsquo;re receiving this because you have an account with Dorado Metals Exchange.
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

export const INNER_WIDTH = width.inner
