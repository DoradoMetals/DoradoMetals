import { space, width, fontStack, screen } from '#documents/theme.ts'
import { header, footer, esc } from '#documents/emails/render/parts.ts'

// The one layout every mailer is built on: 600px, table-based, inline styles,
// no flex and no grid, images by absolute URL. The <style> block carries the
// mobile breakpoint ONLY - Gmail strips it, and every mailer still renders
// correctly when it is gone, which is the test the block has to pass.
//
// DARK-MODE HAZARD, recorded because the design records it: the mailer is dark
// on purpose and Gmail and Outlook apply their own dark-mode transforms on top.
// `color-scheme`/`supported-color-schemes` tell a client the page has already
// handled both, and every coloured cell carries a bgcolor ATTRIBUTE beside its
// inline style because that is the one clients honour when they rewrite CSS.
// None of that is proof: the design's own note says every mailer built from
// this has to be looked at in a real client before it ships.

export function renderMailer(preheader: string, blocks: string[]): string {
  const body = blocks
    .filter((block) => block !== '')
    .map(
      (block, i, all) =>
        `<tr><td style="padding:0 ${space.xl} ${i === all.length - 1 ? '0' : space.md} ${space.xl};">${block}</td></tr>`
    )
    .join('')

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" dir="ltr">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>Dorado Metals Exchange</title>
<style type="text/css">
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
table{border-collapse:collapse !important;}
body{margin:0 !important;padding:0 !important;width:100% !important;}
@media only screen and (max-width:620px){.container{width:100% !important;}}
</style>
</head>
<body bgcolor="${screen.background}" style="background-color:${screen.background};margin:0;padding:0;font-family:${fontStack};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${screen.background}" style="background-color:${screen.background};">
<tr>
<td align="center">
<table role="presentation" width="${width.outer}" cellpadding="0" cellspacing="0" border="0" class="container" bgcolor="${screen.background}" style="width:${width.outer}px;max-width:${width.outer}px;background-color:${screen.background};">
${header()}
${body}
<tr><td style="height:${space.xl};line-height:${space.xl};font-size:0;">&nbsp;</td></tr>
${footer()}
</table>
</td>
</tr>
</table>
</body>
</html>`
}
