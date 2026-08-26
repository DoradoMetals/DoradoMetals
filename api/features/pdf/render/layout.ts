import { formatPhoneNumber } from "#shared/utils/formatPhoneNumber.ts";
import {
  LOGO_SRC,
  ICON_PIN_SRC,
  ICON_PHONE_SRC,
  ICON_URL_SRC,
  ICON_EMAIL_SRC,
  FONT_POPPINS_400_SRC,
  FONT_POPPINS_600_SRC,
  FONT_POPPINS_700_SRC,
} from "#features/pdf/render/assets.ts";

function renderHeader(): string {
  const phone = formatPhoneNumber(process.env.FEDEX_DORADO_PHONE_NUMBER);

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
  `;
}

export interface ShellInput {
  title: string;
  /** Optional - the caller passes a falsy value when there is no subtitle, and
   *  the template omits the element rather than rendering an empty one. */
  subtitle?: string | null;
  /** Already-rendered HTML for the body. Interpolated as-is. */
  bodyHtml: string;
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
          ${subtitle ? `<div class="packing-subtitle">${subtitle}</div>` : ""}
          ${bodyHtml}
        </div>
      </body>
    </html>
  `;
}

const baseStyles = `
  /* Self-hosted, inlined as data URIs. This was an @import from
     fonts.googleapis.com, which made every invoice depend on Google being
     reachable - and failed silently into a different typeface when it was not.
     Only the three weights the templates actually use. */
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
    background: white;
  }
  .page {
    background: white;
    position: relative;
  }

  .header {
    padding: 12px 0 10px 0;
    margin-bottom: 16px;
  }
  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .brand-logo {
    height: 70px;
  }
  .header-contact {
    margin-left: auto; 
    display: flex;
    gap: 4px;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    font-size: 12px;
    color: #555;
  }
  .header-contact-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .header-contact-icon {
    width: 14px;
    height: 14px;
    color: #debb59;
  }
  .header-divider {
    margin-top: 10px;
    height: 2px;
    background: #debb59;
  }


  .packing-title {
    font-size: 20px;
    font-weight: bold;
    margin-top: 10px;
    margin-bottom: 5px;
  }
  .packing-subtitle {
    font-size: 12px;
    margin-bottom: 20px;
  }
  .shipping-info {
    display: flex;
    justify-content: space-between;
    gap: 5px;
    margin-bottom: 20px;
  }
  .shipping-box {
    border-left-width: 1px;
    border-left-style: solid;
    border-left-color: #debb59;
    border-radius: 0;
    width: 30%;
    font-size: 12px;
    margin: 0;
  }
  .shipping-box h3 {
    background: #debb59;
    color: white;
    margin: 0;
    padding: 5px;
    font-size: 12px;
  }
  .shipping-box h4 {
    font-size: 14px;
    margin: 0 0 12px 0;
    font-weight: 600;
  }
  .shipping-box p {
    font-size: 12px;
    margin: 0;
    margin-top: 8px;
    line-height: 1.4;
  }
  .shipping-box div {
    padding: 10px;
  }
  .details {
    display: flex;
    flex-direction: column;
    width: 40%;
    padding: 0;
    border-left-width: 1px;
    border-left-style: solid;
    border-left-color: #debb59;
    font-size: 12px;
  }
  .details h3 {
    background: #debb59;
    color: white;
    margin: 0;
    padding: 5px;
    font-size: 12px;
    text-align: left;
  }
  .detail-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
  }
  .detail-label {
    font-weight: normal;
    white-space: nowrap;
  }
  .detail-value {
    font-weight: 600;
  }
  .order-info, .table-container {
    margin-bottom: 20px;
  }
  .section-header {
    background: #debb59;
    color: white;
    padding: 8px;
    font-weight: bold;
    font-size: 14px;
    border-radius: 5px 5px 0 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th, td {
    padding: 8px;
    text-align: center;
  }
  th {
    border: none;
    background: #debb59;
    color: white;
  }
  td {
    border: none;
  }
  table tr:nth-child(even) {
    background-color: #f5f5f5;
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
  .text-bold { font-weight: bold; font-size: 12px; }

  .step { display: flex; flex-direction: column; }
  .step h3 { margin: 4px; }
  .step p { margin-top: 0; margin-bottom: 32px; }

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
  }
  .package-details-title {
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 4px;
  }

  .invoice-header {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
  }
  .invoice-card {
    flex: 1;
    border-left-width: 1px;
    border-left-style: solid;
    border-left-color: #debb59;
    font-size: 11px;
  }
  .invoice-card-title {
    background: #debb59;
    color: white;
    padding: 5px;
    font-weight: bold;
    font-size: 12px;
  }
  .invoice-card-body {
    padding: 8px 10px;
    line-height: 1.4;
  }
  .invoice-card-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 3px;
  }
  .invoice-card-row span:last-child {
    font-weight: 600;
  }
`;

