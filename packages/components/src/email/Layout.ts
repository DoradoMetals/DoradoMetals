import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { screen, type Palette } from './palette.ts'
import { Footer, Header, NBSP } from './components.ts'
import { GUTTER, WIDTH, fontStack, space } from './style.ts'

const HEAD_STYLE = `body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
table{border-collapse:collapse !important;}
body{margin:0 !important;padding:0 !important;width:100% !important;}
@media only screen and (max-width:620px){.container{width:100% !important;}}`

export type LayoutProps = {
  preheader: string
  blocks: ReactNode[]
  palette?: Palette
}

export function Layout({ preheader, blocks, palette = screen }: LayoutProps): ReactNode {
  const body = blocks
    .filter((block) => block !== null && block !== false && block !== '')
    .map((block, i, all) =>
      h(
        'tr',
        { key: i },
        h(
          'td',
          {
            style: {
              padding: `0 ${GUTTER} ${i === all.length - 1 ? '0' : space.md} ${GUTTER}`,
            },
          },
          block
        )
      )
    )

  return h(
    'html',
    { lang: 'en', dir: 'ltr' },
    h(
      'head',
      null,
      h('meta', { httpEquiv: 'Content-Type', content: 'text/html; charset=UTF-8' }),
      h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      h('meta', { name: 'x-apple-disable-message-reformatting' }),
      h('meta', { name: 'color-scheme', content: 'light dark' }),
      h('meta', { name: 'supported-color-schemes', content: 'light dark' }),
      h('title', null, 'Dorado Metals Exchange'),
      h('style', { type: 'text/css', dangerouslySetInnerHTML: { __html: HEAD_STYLE } })
    ),
    h(
      'body',
      {
        bgcolor: palette.background,
        style: {
          backgroundColor: palette.background,
          margin: 0,
          padding: 0,
          fontFamily: fontStack,
        },
      },
      h(
        'div',
        {
          style: {
            display: 'none',
            maxHeight: 0,
            overflow: 'hidden',
            opacity: 0,
            color: 'transparent',
          },
        },
        preheader
      ),
      h(
        'table',
        {
          role: 'presentation',
          width: '100%',
          cellPadding: 0,
          cellSpacing: 0,
          border: 0,
          bgcolor: palette.background,
          style: { backgroundColor: palette.background },
        },
        h(
          'tbody',
          null,
          h(
            'tr',
            null,
            h(
              'td',
              { align: 'center' },
              h(
                'table',
                {
                  role: 'presentation',
                  width: String(WIDTH.outer),
                  cellPadding: 0,
                  cellSpacing: 0,
                  border: 0,
                  className: 'container',
                  bgcolor: palette.background,
                  style: {
                    width: `${WIDTH.outer}px`,
                    maxWidth: `${WIDTH.outer}px`,
                    backgroundColor: palette.background,
                  },
                },
                h(Header, { palette }),
                h('tbody', null, body),
                h(
                  'tbody',
                  null,
                  h(
                    'tr',
                    null,
                    h('td', { style: { height: GUTTER, lineHeight: GUTTER, fontSize: 0 } }, NBSP)
                  )
                ),
                h(Footer, { palette })
              )
            )
          )
        )
      )
    )
  )
}

const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n'

/** A mailer as the string a transport sends. */
export function renderMailer(
  preheader: string,
  blocks: ReactNode[],
  palette: Palette = screen
): string {
  return DOCTYPE + renderToStaticMarkup(h(Layout, { preheader, blocks, palette }))
}
