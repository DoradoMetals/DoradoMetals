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
