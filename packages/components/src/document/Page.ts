import { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { themeCss } from '@dorado/theme/tokens'
import { paper } from '../email/palette.ts'
import { fontStack } from '../email/style.ts'
import { PAGE } from './primitives.ts'

const THEME = themeCss()

function sheet(fontFamily: string): string {
  return `*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{width:${PAGE.width}px;background:${paper.background};color:${paper.foreground};font-family:${fontFamily};
  -webkit-print-color-adjust:exact;print-color-adjust:exact;}
.page{width:${PAGE.width}px;min-height:${PAGE.height}px;display:flex;flex-direction:column;}
.page-body{flex:1 0 auto;}
p{margin:0;}
@page{size:${PAGE.width}px ${PAGE.height}px;margin:0;}`
}

export type PageProps = {
  title: string
  head: ReactNode
  body: ReactNode[]
  foot: ReactNode
  fontFaces?: string
  fontFamily?: string
}

export function Page({
  title,
  head,
  body,
  foot,
  fontFaces = '',
  fontFamily = fontStack,
}: PageProps): ReactNode {
  return h(
    'html',
    { lang: 'en' },
    h(
      'head',
      null,
      h('meta', { charSet: 'utf-8' }),
      h('title', null, title),
      h('style', {
        dangerouslySetInnerHTML: { __html: `${fontFaces}\n${THEME}\n${sheet(fontFamily)}` },
      })
    ),
    h(
      'body',
      null,
      h('div', { className: 'page' }, head, h('div', { className: 'page-body' }, ...body), foot)
    )
  )
}

export function renderDocument(props: PageProps): string {
  return `<!DOCTYPE html>\n${renderToStaticMarkup(h(Page, props))}`
}
