import puppeteer from "puppeteer";
import type { Browser, PDFOptions } from "puppeteer";

// Chromium takes a second or so to start, and the previous code paid that on
// every PDF request. One instance is launched lazily and shared; only the page
// is per-render. The launch promise itself is cached so concurrent first
// requests wait on the same startup instead of racing to launch several.
//
// THE PROMISE IS THE CACHE, NOT THE BROWSER, and the type says so. Caching the
// resolved browser would mean two concurrent first requests each see `null` and
// each launch one - the second leaks, because only the last handle is kept and
// nothing ever closes the first. Storing the in-flight promise is what makes
// the second caller wait on the first launch.
let browserPromise: Promise<Browser> | null = null;

// The page context, for the one callback that runs inside the browser rather
// than in Node. The API's tsconfig deliberately omits the "dom" lib - adding it
// to type four lines here would make `document` and `window` look valid in
// every server file in the codebase, which is exactly the kind of quiet
// widening that lets a browser API reach production code.
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
    // WAITING FOR FONTS, EXPLICITLY, RATHER THAN FOR THE NETWORK TO GO QUIET.
    //
    // This was `waitUntil: "networkidle0"`, and puppeteer's own types now
    // EXCLUDE networkidle0 and networkidle2 from setContent - it is still
    // honoured at runtime, but it is on the way out and depending on it means
    // a future upgrade silently changes when the PDF is captured.
    //
    // What the wait is actually for is one thing: layout.js @imports Poppins
    // from Google Fonts, so every invoice and packing list fetches a stylesheet
    // and a font file before it can be rendered with the right typeface.
    // `document.fonts.ready` says that directly, is supported, and is FASTER -
    // measured on the real template, networkidle0 took ~1960ms and this takes
    // ~390ms, because network-idle waits out a fixed quiet period after the
    // last response while this resolves the moment the fonts are in.
    //
    // Verified rather than assumed: a PDF rendered this way still has Poppins
    // embedded in it, checked by searching the output bytes for the font name.
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

// For graceful shutdown, and so tests do not leave Chromium running. Every PDF
// test calls this in after(); without it node never exits, which once cost an
// hour and eleven orphaned Chromium processes.
//
// The handle is cleared BEFORE awaiting, so a render arriving mid-shutdown
// launches a fresh browser rather than getting the one being closed. The
// `.catch(() => null)` covers a cached promise that rejected: there is no
// browser to close, and shutdown should not re-throw a launch failure that the
// original caller has already seen.
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  const browser = await pending.catch(() => null);
  if (browser) await browser.close();
}
