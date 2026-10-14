import puppeteer from 'puppeteer'
import type { Browser, PDFOptions } from 'puppeteer'
import { FOOTER_TEMPLATE_ID } from '@dorado/components/document'

let browserPromise: Promise<Browser> | null = null

interface PageGlobals {
  document: {
    fonts: { ready: Promise<unknown> }
    getElementById: (id: string) => {
      innerHTML: string
      getAttribute: (name: string) => string | null
    } | null
  }
}

async function launch(): Promise<Browser> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
  })

  browser.on('disconnected', () => {
    browserPromise = null
  })

  return browser
}

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch().catch((err: unknown) => {
      browserPromise = null
      throw err
    })
  }
  return browserPromise
}

const paperGround = '#ffffff'

const DEFAULT_PDF_OPTIONS: PDFOptions = {
  width: '816px',
  height: '1056px',
  printBackground: true,
  displayHeaderFooter: false,
  margin: { top: '0', bottom: '0', left: '0', right: '0' },
}

function band(ground: string, height: string): string {
  return `<style>#header,#footer{padding:0 !important;}</style><div style="width:100%;height:${height};margin:0;background:${ground};-webkit-print-color-adjust:exact;print-color-adjust:exact"></div>`
}

export async function renderPdf(html: string, pdfOptions: PDFOptions = {}): Promise<Uint8Array> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setContent(html, { waitUntil: 'load' })
    const frame = await page.evaluate((id: string): string[] => {
      const template = (globalThis as unknown as PageGlobals).document.getElementById(id)
      if (!template) return []
      return [
        template.innerHTML,
        template.getAttribute('data-top') ?? '0',
        template.getAttribute('data-bottom') ?? '0',
        template.getAttribute('data-ground') ?? '#ffffff',
      ]
    }, FOOTER_TEMPLATE_ID)
    await page.evaluate(() =>
      (globalThis as unknown as PageGlobals).document.fonts.ready.then(() => undefined)
    )
    const [footer, top, bottom, ground] = frame
    return await page.pdf({
      ...DEFAULT_PDF_OPTIONS,
      ...(footer === undefined
        ? {}
        : {
            displayHeaderFooter: true,
            headerTemplate: band(ground ?? paperGround, `${top ?? 0}px`),
            footerTemplate: footer,
            margin: { top: `${top ?? 0}px`, bottom: `${bottom ?? 0}px`, left: '0', right: '0' },
          }),
      ...pdfOptions,
    })
  } finally {
    await page.close()
  }
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return
  const pending = browserPromise
  browserPromise = null
  const browser = await pending.catch(() => null)
  if (browser) await browser.close()
}
