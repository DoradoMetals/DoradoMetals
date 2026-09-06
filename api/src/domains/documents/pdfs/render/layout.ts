import { formatPhoneNumber } from '#shared/utils/formatPhoneNumber.ts'
import {
  LOGO_SRC,
  ICON_PIN_SRC,
  ICON_PHONE_SRC,
  ICON_URL_SRC,
  ICON_EMAIL_SRC,
  FONT_POPPINS_400_SRC,
  FONT_POPPINS_600_SRC,
  FONT_POPPINS_700_SRC,
} from '#documents/pdfs/render/assets.ts'
import { type, space, radius, paper } from '#documents/theme.ts'

// The PDFs wear the mailers' system (ruling 95): the same type ramp, the same
// spacing steps, the same hairline, the same label-left/figure-right row and
// the same bordered card - against the paper palette, because a document is
// printed. THE GOLD IS RETIRED: #debb59 was a filled bar behind every section
// header and a rule under the logo, and it is gone from both documents.
//
// WHAT DID NOT CHANGE: not one class name, not one cell, not one number. Every
// table, row and value `sections.ts` builds is untouched, which is what lets the
// packing-list and invoice content tests stay exactly as they were.
//
// THE PDFs STILL WANT THEIR OWN FIGMA PAGE. The Media page draws mailers and
// nothing else, so the paper palette here is DERIVED from the mailer tokens
// rather than read off a design, and the page furniture - header, footer, the
// section band - is this file's judgement. Draw them, and this file becomes a
// transcription instead.

function renderHeader(): string {
  const phone = formatPhoneNumber(process.env.FEDEX_DORADO_PHONE_NUMBER)

  return `
    <div class="header">
      <div class="header-content">
        <div class="logo">
          <img
            src="${LOGO_SRC}"
            alt="Dorado Metals Exchange"
            class="brand-logo"
          />
        </div>

        <div class="header-contact">
          <div class="header-contact-row">
            <img src="${ICON_PIN_SRC}" alt="Address" class="header-contact-icon" />
            <span>3169 Royal Ln, Dallas, TX 75229</span>
          </div>
          <div class="header-contact-row">
            <img src="${ICON_PHONE_SRC}" alt="Phone" class="header-contact-icon" />
            <span>${phone}</span>
          </div>
          <div class="header-contact-row">
            <img src="${ICON_URL_SRC}" alt="Website" class="header-contact-icon" />
            <span>www.doradometals.com</span>
          </div>
          <div class="header-contact-row">
            <img src="${ICON_EMAIL_SRC}" alt="Email" class="header-contact-icon" />
            <span>support@doradometals.com</span>
          </div>
        </div>
      </div>

      <div class="header-divider"></div>
    </div>
  `
}

// The same postal line the Email Footer carries, for the same reason: a
// document that leaves the building says where it came from.
function renderFooter(): string {
  return `
    <div class="page-footer">
      <div class="page-footer-rule"></div>
      <div class="page-footer-text">
        Dorado Metals Exchange &middot; 3198 Royal Lane, Suite 209, Dallas, Texas 75229
        &middot; support@doradometals.com
      </div>
    </div>
  `
}

interface ShellInput {
  title: string
  subtitle?: string | null
  bodyHtml: string
}

export function renderShell({ title, subtitle, bodyHtml }: ShellInput): string {
  return `
    <html>
      <head>
        <style>${baseStyles}</style>
      </head>
      <body>
        <div class="page">
          ${renderHeader()}
          <div class="packing-title">${title}</div>
          ${subtitle ? `<div class="packing-subtitle">${subtitle}</div>` : ''}
          ${bodyHtml}
          ${renderFooter()}
        </div>
      </body>
    </html>
  `
}

const baseStyles = `
  /* Self-hosted, inlined as data URIs. This was an @import from
     fonts.googleapis.com, which made every invoice depend on Google being
     reachable - and failed silently into a different typeface when it was not.
     Only the three weights the templates actually use.

     THE FACE IS STILL POPPINS while the mailers ask for Geist. A mailer can
     name a font and let the client fall back; a PDF is rendered here, so the
     file has to exist in api/src/shared/assets/fonts - and no Geist woff2 is
     in this repo. Dropping a weight pair in there and changing three lines is
     the whole job, on the day someone wants it. */
  @font-face {
    font-family: 'Poppins';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url(${FONT_POPPINS_400_SRC}) format('woff2');
  }
  @font-face {
    font-family: 'Poppins';
    font-style: normal;
    font-weight: 600;
    font-display: swap;
    src: url(${FONT_POPPINS_600_SRC}) format('woff2');
  }
  @font-face {
    font-family: 'Poppins';
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url(${FONT_POPPINS_700_SRC}) format('woff2');
  }

  body {
    font-family: 'Poppins', Arial, sans-serif;
    background: ${paper.background};
    color: ${paper.foreground};
    font-size: ${type.micro};
    line-height: ${type.microLine};
  }
  .page {
    background: ${paper.background};
    position: relative;
  }

  .header {
    padding: 12px 0 10px 0;
    margin-bottom: ${space.md};
  }
  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${space.lg};
  }
  .brand-logo {
    height: 70px;
  }
  .header-contact {
    margin-left: auto;
    display: flex;
    gap: ${space.xs2};
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    font-size: ${type.micro};
    color: ${paper.muted};
  }
  .header-contact-row {
    display: flex;
    align-items: center;
    gap: ${space.xs2};
  }
  .header-contact-icon {
    width: 14px;
    height: 14px;
  }
  .header-divider {
    margin-top: 10px;
    height: 1px;
    background: ${paper.border};
  }

  .page-footer {
    margin-top: ${space.xl};
  }
  .page-footer-rule {
    height: 1px;
    background: ${paper.border};
  }
  .page-footer-text {
    padding-top: ${space.xs};
    font-size: ${type.micro};
    line-height: ${type.microLine};
    color: ${paper.muted};
    text-align: center;
  }

  /* Heading/H3 from the mailer ramp. */
  .packing-title {
    font-size: ${type.h3};
    line-height: ${type.h3Line};
    letter-spacing: ${type.h3Tracking};
    font-weight: ${type.semibold};
    margin-top: 10px;
    margin-bottom: ${space.xs2};
  }
  .packing-subtitle {
    font-size: ${type.micro};
    color: ${paper.muted};
    margin-bottom: ${space.md};
  }

  /* Email Card: a bordered, rounded panel with a quiet ground. Three of them
     sit side by side at the top of a packing list. */
  .shipping-info {
    display: flex;
    justify-content: space-between;
    gap: ${space.xs};
    margin-bottom: ${space.md};
  }
  .shipping-box {
    border: 1px solid ${paper.border};
    border-radius: ${radius};
    background: ${paper.card};
    width: 30%;
    font-size: ${type.micro};
    margin: 0;
    overflow: hidden;
  }
  .shipping-box h3 {
    background: transparent;
    color: ${paper.muted};
    margin: 0;
    padding: ${space.xs} 12px 0 12px;
    font-size: ${type.micro};
    font-weight: ${type.medium};
  }
  .shipping-box h4 {
    font-size: ${type.small};
    margin: 0 0 ${space.xs} 0;
    font-weight: ${type.semibold};
  }
  .shipping-box p {
    font-size: ${type.micro};
    margin: 0;
    margin-top: 6px;
    line-height: ${type.microLine};
    color: ${paper.muted};
  }
  .shipping-box div {
    padding: ${space.xs} 12px 12px 12px;
  }
  .details {
    display: flex;
    flex-direction: column;
    width: 40%;
    padding: 0;
    border: 1px solid ${paper.border};
    border-radius: ${radius};
    background: ${paper.card};
    font-size: ${type.micro};
    overflow: hidden;
  }
  .details h3 {
    background: transparent;
    color: ${paper.muted};
    margin: 0;
    padding: ${space.xs} 12px 0 12px;
    font-size: ${type.micro};
    font-weight: ${type.medium};
    text-align: left;
  }
  .detail-content {
    display: flex;
    flex-direction: column;
    padding: ${space.xs2} 12px ${space.xs} 12px;
  }

  /* Email Row: label left, figure right, hairline between. */
  .detail-row {
    display: flex;
    justify-content: space-between;
    gap: ${space.md};
    padding: 6px 0;
    border-top: 1px solid ${paper.border};
  }
  .detail-row:first-child {
    border-top: none;
  }
  .detail-label {
    font-weight: ${type.regular};
    color: ${paper.muted};
    white-space: nowrap;
  }
  .detail-value {
    font-weight: ${type.medium};
    text-align: right;
  }

  .order-info, .table-container {
    margin-bottom: ${space.md};
  }
  .section-header {
    background: ${paper.card};
    color: ${paper.muted};
    padding: ${space.xs} 10px;
    font-weight: ${type.medium};
    font-size: ${type.micro};
    border: 1px solid ${paper.border};
    border-bottom: none;
    border-radius: ${radius} ${radius} 0 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: ${type.micro};
  }
  th, td {
    padding: ${space.xs} 10px;
    text-align: center;
  }
  th {
    border: none;
    border-bottom: 1px solid ${paper.border};
    background: ${paper.background};
    color: ${paper.muted};
    font-weight: ${type.medium};
  }
  td {
    border: none;
    border-bottom: 1px solid ${paper.border};
  }
  table tr:nth-child(even) {
    background-color: ${paper.background};
  }
  .order-info table {
    width: 100%;
    table-layout: fixed;
  }
  .order-info th,
  .order-info td {
    width: 33%;
  }
  .text-right { text-align: right; }
  .text-left { text-align: left; }
  .text-bold { font-weight: ${type.semibold}; font-size: ${type.micro}; }

  .step { display: flex; flex-direction: column; }
  .step h3 {
    margin: ${space.xs2};
    font-size: ${type.small};
    font-weight: ${type.semibold};
  }
  .step p { margin-top: 0; margin-bottom: ${space.xl}; color: ${paper.muted}; }

  .package-area {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 50px;
    width: 100%;
    align-items: center;
    margin-bottom: 50px;
  }
  .package-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: ${paper.muted};
  }
  .package-details-title {
    font-size: ${type.small};
    font-weight: ${type.semibold};
    color: ${paper.foreground};
    margin-bottom: ${space.xs2};
  }

  .invoice-header {
    display: flex;
    gap: ${space.xs};
    margin-bottom: ${space.md};
  }
  .invoice-card {
    flex: 1;
    border: 1px solid ${paper.border};
    border-radius: ${radius};
    background: ${paper.card};
    font-size: ${type.micro};
    overflow: hidden;
  }
  .invoice-card-title {
    background: transparent;
    color: ${paper.muted};
    padding: ${space.xs} 12px 0 12px;
    font-weight: ${type.medium};
    font-size: ${type.micro};
  }
  .invoice-card-body {
    padding: ${space.xs2} 12px ${space.xs} 12px;
    line-height: ${type.microLine};
  }
  .invoice-card-row {
    display: flex;
    justify-content: space-between;
    gap: ${space.md};
    padding: 6px 0;
    border-top: 1px solid ${paper.border};
  }
  .invoice-card-row:first-child {
    border-top: none;
  }
  .invoice-card-row span:first-child {
    color: ${paper.muted};
  }
  .invoice-card-row span:last-child {
    font-weight: ${type.medium};
  }
`
