import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read SYNCHRONOUSLY at module load, on purpose. These are five small SVGs and
// they are inlined as data URIs so a rendered PDF depends on nothing external -
// no filesystem access mid-render, no network. Making it async would move the
// read into the render path for no benefit.
//
// The one asset NOT inlined is the Poppins font, which layout.ts @imports from
// Google. That is written up in FOLLOWUPS: it is the single outbound request a
// packing list makes, and if it fails the document silently changes typeface.
function dataUriFromAssets(relPath: string, mime: string): string {
  const absPath = path.join(__dirname, "..", "..", "..", "shared", "assets", relPath);
  const file = fs.readFileSync(absPath);
  return `data:${mime};base64,${file.toString("base64")}`;
}

export const LOGO_SRC = dataUriFromAssets("full.svg", "image/svg+xml");
export const ICON_PIN_SRC = dataUriFromAssets("pin.svg", "image/svg+xml");
export const ICON_PHONE_SRC = dataUriFromAssets("phone.svg", "image/svg+xml");
export const ICON_URL_SRC = dataUriFromAssets("url.svg", "image/svg+xml");
export const ICON_EMAIL_SRC = dataUriFromAssets("email.svg", "image/svg+xml");

// POPPINS, SELF-HOSTED, FOR THE SAME REASON AS EVERYTHING ELSE HERE.
//
// layout.ts used to @import this from fonts.googleapis.com, so every invoice
// and packing list made an outbound request at render time - the only one these
// documents made. If Google was slow or unreachable the render did not fail, it
// silently fell back to another typeface. Reproduced before fixing: with
// googleapis and gstatic blocked, the old template embedded the string
// "Poppins" ZERO times; with these files it embeds it nine.
//
// THREE WEIGHTS, NOT FOUR. The old @import asked for 400/500/600/700, but the
// templates only ever use `normal`, `600` and `bold` - checked across layout.ts,
// sections.js and service.js. 500 was never rendered, so it is not carried.
//
// ~24KB in total, latin subset. That is smaller than it looks like it should
// be; the files are not truncated - each one's internal woff2 length field
// matches its size on disk exactly.
export const FONT_POPPINS_400_SRC = dataUriFromAssets("fonts/poppins-latin-400.woff2", "font/woff2");
export const FONT_POPPINS_600_SRC = dataUriFromAssets("fonts/poppins-latin-600.woff2", "font/woff2");
export const FONT_POPPINS_700_SRC = dataUriFromAssets("fonts/poppins-latin-700.woff2", "font/woff2");

