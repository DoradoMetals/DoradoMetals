import puppeteer from 'puppeteer'
import type { Browser, PDFOptions } from 'puppeteer'

let browserPromise: Promise<Browser> | null = null

interface PageGlobals {
  document: { fonts: { ready: Promise<unknown> } }
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

const DEFAULT_PDF_OPTIONS: PDFOptions = {
  width: '816px',
  height: '1056px',
  printBackground: true,
  displayHeaderFooter: false,
  margin: { top: '0', bottom: '0', left: '0', right: '0' },
}

export async function renderPdf(html: string, pdfOptions: PDFOptions = {}): Promise<Uint8Array> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() =>
      (globalThis as unknown as PageGlobals).document.fonts.ready.then(() => undefined)
    )
    return await page.pdf({ ...DEFAULT_PDF_OPTIONS, ...pdfOptions })
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
