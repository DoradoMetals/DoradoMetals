import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assertAssetsDir } from "#domain/media/pdfs/rules.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read SYNCHRONOUSLY at module load, on purpose: five small SVGs (plus three font files below) inlined as data URIs so a rendered PDF depends on nothing external mid-render.
// Found by walking up, not by counting ".." - a fixed depth broke the moment this file moved (every document lost its logo); walking up doesn't care how deep the file sits.
const assetsDir = (() => {
  let found: string | null = null;
  let dir = __dirname;
  for (let i = 0; i < 10 && found === null; i++) {
    const candidate = path.join(dir, "shared", "assets");
    if (fs.existsSync(candidate)) found = candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  assertAssetsDir(found, __dirname);
  return found;
})();

function dataUriFromAssets(relPath: string, mime: string): string {
  const absPath = path.join(assetsDir, relPath);
  const file = fs.readFileSync(absPath);
  return `data:${mime};base64,${file.toString("base64")}`;
}

export const LOGO_SRC = dataUriFromAssets("full.svg", "image/svg+xml");
export const ICON_PIN_SRC = dataUriFromAssets("pin.svg", "image/svg+xml");
export const ICON_PHONE_SRC = dataUriFromAssets("phone.svg", "image/svg+xml");
export const ICON_URL_SRC = dataUriFromAssets("url.svg", "image/svg+xml");
export const ICON_EMAIL_SRC = dataUriFromAssets("email.svg", "image/svg+xml");

// Poppins, self-hosted for the same reason as the SVGs above: layout.ts used to @import this from Google, the one outbound request these documents made, which silently fell back to another typeface if unreachable.
// Three weights only (400/600/700, ~24KB latin subset) - normal/600/bold is all the templates use.
export const FONT_POPPINS_400_SRC = dataUriFromAssets("fonts/poppins-latin-400.woff2", "font/woff2");
export const FONT_POPPINS_600_SRC = dataUriFromAssets("fonts/poppins-latin-600.woff2", "font/woff2");
export const FONT_POPPINS_700_SRC = dataUriFromAssets("fonts/poppins-latin-700.woff2", "font/woff2");

