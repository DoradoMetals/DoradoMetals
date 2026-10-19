import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { themeCss } from '@dorado/theme/tokens'
import { paper } from '../email/palette.ts'
import { fontStack } from '../email/style.ts'
import { PAGE, Footer, Header, footerHeight, type Checkout, type Density } from './primitives.ts'

const THEME = themeCss()

export const FOOTER_TEMPLATE_ID = 'page-footer'

function sheet(fontFamily: string, bottom: number): string {
  return `*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:${paper.background};}
body{width:${PAGE.width}px;color:${paper.foreground};font-family:${fontFamily};
  -webkit-print-color-adjust:exact;print-color-adjust:exact;}
.page{width:${PAGE.width}px;}
p{margin:0;}
@page{size:${PAGE.width}px ${PAGE.height}px;margin:${PAGE.top}px 0 ${bottom}px 0;}`
}

export type PageProps = {
  title: string
  head: ReactNode
  body: ReactNode[]
  foot: ReactNode
  footHeight: number
  fontFaces?: string
  fontFamily?: string
}

function footerTemplate(foot: ReactNode, fontFaces: string): string {
  return `<style>${fontFaces}\n*{box-sizing:border-box;}p{margin:0;}#header,#footer{padding:0 !important;}</style>${renderToStaticMarkup(
    h('div', { style: { margin: 0, padding: 0 } }, foot)
  )}`
}

export function Page({
  title,
  head,
  body,
  foot,
  footHeight,
  fontFaces = '',
  fontFamily = fontStack,
}: PageProps): ReactNode {
  return h(
    'html',
    { lang: 'en', dir: 'ltr' },
    h(
      'head',
      null,
      h('meta', { charSet: 'utf-8' }),
      h('title', null, title),
      h('style', {
        dangerouslySetInnerHTML: {
          __html: `${fontFaces}\n${THEME}\n${sheet(fontFamily, footHeight)}`,
        },
      })
    ),
    h(
      'body',
      null,
      h('div', { className: 'page' }, head, ...body),
      h('template', {
        id: FOOTER_TEMPLATE_ID,
        'data-top': String(PAGE.top),
        'data-bottom': String(footHeight),
        'data-ground': paper.background,
        dangerouslySetInnerHTML: { __html: footerTemplate(foot, fontFaces) },
      })
    )
  )
}

export function renderDocument(props: PageProps): string {
  return `<!DOCTYPE html>\n${renderToStaticMarkup(h(Page, props))}`
}

export type DocumentFrame = {
  title: string
  kind: string
  reference: string | null
  body: ReactNode[]
  footer: string
  density?: Density
  footDensity?: Density
  checkout?: Checkout | null
  contact?: string[]
}

export function renderFramed(frame: DocumentFrame, logo: string, fontFaces: string): string {
  const density = frame.density ?? 'compact'
  const foot = frame.footDensity ?? density
  return renderDocument({
    title: frame.title,
    head: h(Header, {
      kind: frame.kind,
      reference: frame.reference,
      logo,
      density,
      checkout: frame.checkout ?? null,
    }),
    body: frame.body,
    foot: h(Footer, { issued: frame.footer, density: foot, contact: frame.contact ?? [] }),
    footHeight: footerHeight(foot, (frame.contact ?? []).length > 0),
    fontFaces,
    fontFamily: fontStack,
  })
}
