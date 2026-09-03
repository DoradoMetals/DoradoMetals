// Chromium, and turning HTML into bytes. An adapter to something outside the
// domain, which is why it lives here rather than in features/pdf: this decides
// HOW a document becomes a PDF, features/pdf/render decides WHAT the document
// says. Swapping the renderer should not touch a layout.
import puppeteer from "puppeteer";
import type { Browser, PDFOptions } from "puppeteer";

// Chromium takes ~1s to start; one instance launches lazily and is shared (only the page is per-render), with the LAUNCH PROMISE cached so concurrent first requests wait on the same startup.
// The promise is the cache, not the resolved browser — caching the browser would let two concurrent first requests each see null and each launch one, leaking the one whose handle nothing keeps.
let browserPromise: Promise<Browser> | null = null;

// Page-context globals for the one callback that runs inside the browser — the API's tsconfig deliberately omits the "dom" lib, so this avoids widening `document`/`window` into every server file.
interface PageGlobals {
  document: { fonts: { ready: Promise<unknown> } };
}

async function launch(): Promise<Browser> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

  // If it dies (crash, OOM, external kill) drop the handle so the next render
  // launches a fresh one rather than reusing a dead browser forever.
  browser.on("disconnected", () => {
    browserPromise = null;
  });

  return browser;
}

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch().catch((err: unknown) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

const DEFAULT_PDF_OPTIONS: PDFOptions = {
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: `
      <div style="font-size:10px; width:100%; text-align:right; padding-right:20px;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`,
  footerTemplate: `<div></div>`,
  margin: { top: "20px", bottom: "20px", left: "15px", right: "15px" },
};

// Returns puppeteer's own bytes - a Uint8Array, NOT a Buffer. Callers do
// res.end(pdf) and read pdf.length, both of which work either way, and
// features/pdf/service.test.js asserts against both rather than converting.
// Typing it as Buffer here would be a lie that happens to compile.
export async function renderPdf(html: string, pdfOptions: PDFOptions = {}): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Waits for fonts explicitly (document.fonts.ready) rather than for the network to go quiet — puppeteer's types now EXCLUDE networkidle0/networkidle2 from setContent (still honored at runtime, but on the way out), and depending on it means a future upgrade silently changes when the PDF is captured.
    // Measured faster too: layout.js @imports Poppins from Google Fonts, and document.fonts.ready resolves the moment it's loaded rather than waiting out a fixed quiet period (~390ms vs ~1960ms on the real template).
    // Verified, not assumed — the rendered PDF still has Poppins embedded, checked by searching the output bytes for the font name.
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() =>
      (globalThis as unknown as PageGlobals).document.fonts.ready.then(() => undefined)
    );
    return await page.pdf({ ...DEFAULT_PDF_OPTIONS, ...pdfOptions });
  } finally {
    // Closing the page is what reclaims the memory; the browser stays up.
    await page.close();
  }
}

// For graceful shutdown and so tests don't leave Chromium running — every PDF test calls this in after(); without it node never exits (once cost an hour and eleven orphaned Chromium processes).
// Handle cleared BEFORE awaiting, so a render arriving mid-shutdown launches a fresh browser instead of getting the one being closed; `.catch(() => null)` swallows a cached launch failure the original caller already saw.
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  const browser = await pending.catch(() => null);
  if (browser) await browser.close();
}
