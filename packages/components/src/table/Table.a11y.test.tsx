import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table'
import { expectNoAxeViolations } from '../test/axe'

describe('Table accessibility', () => {
  it('column heads are scoped, the sortable head announces its sort, and its controls show the focus ring', async () => {
    const { getByRole, getAllByRole, container } = render(
      <Table aria-label="Lots">
        <TableHeader>
          <TableRow>
            <TableHead sorted="asc" onSort={() => {}} onFilter={() => {}}>
              Weight
            </TableHead>
            <TableHead>Item</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>1</TableCell>
            <TableCell>Gold</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    const heads = getAllByRole('columnheader')
    expect(heads.map((h) => h.getAttribute('scope'))).toEqual(['col', 'col'])
    expect(heads[0]!.getAttribute('aria-sort')).toBe('ascending')
    expect(getByRole('button', { name: 'Weight' }).className).toContain('focus-ring')
    expect(getByRole('button', { name: 'Filter' }).className).toContain('focus-ring')
    expect(getByRole('button', { name: 'Filter' }).className).not.toContain('hit-area')
    await expectNoAxeViolations(container)
  })

  it('an interactive row shows the focus ring', () => {
    const { getAllByRole } = render(
      <Table aria-label="Lots">
        <TableBody>
          <TableRow interactive tabIndex={0}>
            <TableCell>Gold</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    expect(getAllByRole('row')[0]!.className).toContain('focus-ring')
  })
})
