import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { Notes } from '../Notes'
import { button } from './cardFixtures'
import { CUSTOMER_ID, names } from './detailFixtures'
import { note } from './moneyFixtures'

describe('Notes (1208:15545)', () => {
  it('draws each note with author, time and body, then the composer', () => {
    render(
      <Notes
        names={names}
        notes={[note(), note({ id: 'n2', author_id: CUSTOMER_ID, body: 'Light lot.' })]}
      />
    )
    expect(screen.getByText('Dana Whitlock')).toBeTruthy()
    expect(screen.getByText('Marguerite Whitfield')).toBeTruthy()
    expect(screen.getByText('Light lot.')).toBeTruthy()
    expect(screen.getByPlaceholderText('Add a note for the team…')).toBeTruthy()
    expect(screen.getAllByText(/^· /).length).toBe(2)
  })

  it('Add note sends the trimmed draft and clears it', () => {
    const onAdd = vi.fn()
    const { container } = render(<Notes names={names} notes={[]} onAdd={onAdd} />)
    const box = screen.getByLabelText('Note') as HTMLTextAreaElement
    expect(button(container, 'Add note')!.disabled).toBe(true)
    fireEvent.change(box, { target: { value: '  call back  ' } })
    fireEvent.click(button(container, 'Add note')!)
    expect(onAdd).toHaveBeenCalledWith('call back')
    expect(box.value).toBe('')
  })

  it('the composer is always drawn, and is disabled only without a writer', () => {
    const { container } = render(<Notes names={names} notes={[note()]} />)
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).disabled).toBe(true)
    expect(button(container, 'Add note')!.disabled).toBe(true)
  })

  it('pending disables Add note; loading and error replace the body', () => {
    const onRetry = vi.fn()
    const { container, rerender } = render(
      <Notes names={names} notes={[note()]} onAdd={vi.fn()} pending />
    )
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'x' } })
    expect(button(container, 'Add note')!.disabled).toBe(true)
    rerender(<Notes names={names} notes={[]} content="loading" />)
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<Notes names={names} notes={[]} content="error" onRetry={onRetry} />)
    expect(screen.getByText('Couldn’t load notes')).toBeTruthy()
    fireEvent.click(button(container, 'Try again')!)
    expect(onRetry).toHaveBeenCalled()
  })
})
