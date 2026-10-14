import { renderFramed, type DocumentFrame } from '@dorado/components/document'
import { DOCUMENT_FONT_FACES, DOCUMENT_LOGO } from '#documents/pdfs/render/assets.ts'

export function documentHtml(frame: DocumentFrame): string {
  return renderFramed(frame, DOCUMENT_LOGO, DOCUMENT_FONT_FACES)
}
