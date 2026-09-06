// The one visual system both documents wear (ruling 95).
//
// Every value below is read off the Figma "Media" page - the Email Header,
// Email Footer, Email Code, Email Row and Email Card symbols and the variables
// they bind. A mailer renders on the DARK ground the design specifies; a PDF is
// printed on paper, so it takes the same ramp, the same spacing, the same
// hairline and the same row and card geometry against a light ground. Nothing
// but the palette differs between them, and the gold is retired on both.

export const type = {
  micro: '12px',
  microLine: '17.4px',
  microTracking: '0.048px',
  small: '13px',
  smallLine: '19.5px',
  body: '15px',
  bodyLine: '24px',
  h3: '22px',
  h3Line: '28.6px',
  h3Tracking: '-0.33px',
  h1: '36px',
  h1Line: '41.4px',
  code: '40px',
  codeLine: '48px',
  codeTracking: '8px',
  regular: '400',
  medium: '500',
  semibold: '600',
}

export const space = {
  xs2: '4px',
  xs: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
}

export const radius = '8px'

// 600 is the width that survives every mail client, Outlook included, without
// horizontal scroll (Email Header, 4:810). 536 is what is left inside the
// 32px gutters, and it is the width every card and row is drawn at.
export const width = { outer: '600', inner: '536' }

// Geist is the brand face and no mail client can be relied on to load a
// webfont, so the stack degrades through the faces that are actually installed
// rather than through a serif default.
export const fontStack =
  "Geist, 'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

// The mailer palette, straight off the design's variables.
export const screen = {
  background: '#09090c',
  card: '#101114',
  border: '#2c2f35',
  foreground: '#f6f7f9',
  muted: '#9499a4',
  primary: '#fafafa',
  onPrimary: '#0d0e11',
}

// The same roles on paper. A document is printed and photocopied, so the ground
// is white and the ink is near-black; the muted and border steps keep the
// contrast ratio the screen palette has, inverted.
export const paper = {
  background: '#ffffff',
  card: '#fbfbfc',
  border: '#dfe1e6',
  foreground: '#111318',
  muted: '#5c6270',
  primary: '#111318',
  onPrimary: '#ffffff',
}
