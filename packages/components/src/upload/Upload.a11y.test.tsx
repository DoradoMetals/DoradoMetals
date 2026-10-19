import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Upload } from './Upload'
import { expectNoAxeViolations } from '../test/axe'

describe('Upload accessibility', () => {
  it('the file input is described by the hint, and the error marks it invalid', async () => {
    const { container, rerender } = render(<Upload onFiles={() => {}} hint="PDF up to 10 MB" />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'PDF up to 10 MB'
    )
    await expectNoAxeViolations(container)
    rerender(
      <Upload
        onFiles={() => {}}
        error={{ reason: 'size', title: 'File too large', remedy: 'Choose a file under 10 MB' }}
      />
    )
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Choose a file under 10 MB'
    )
    await expectNoAxeViolations(container)
  })

  it('the file count is a polite status', () => {
    const { getByRole } = render(<Upload onFiles={() => {}} maxFiles={3} fileCount={1} />)
    expect(getByRole('status').textContent).toBe('1 of 3')
  })
})
