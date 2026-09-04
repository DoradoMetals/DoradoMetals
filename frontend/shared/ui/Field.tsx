import type { ReactNode } from 'react'
import { Field as LibraryField } from '@dorado/components'

export type FieldProps = {
  label: ReactNode
  /** The `id` of the control inside. Omit when there is nothing to point at. */
  htmlFor?: string
  children: ReactNode
  /** LAYOUT ONLY — width, grid placement, alignment. Never appearance. */
  className?: string
}

export function Field({ label, htmlFor, children, className }: FieldProps) {
  return (
    <LibraryField label={label} htmlFor={htmlFor} className={className}>
      {children}
    </LibraryField>
  )
}

export default Field
