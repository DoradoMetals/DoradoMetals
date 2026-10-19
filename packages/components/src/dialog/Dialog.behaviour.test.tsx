import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Dialog'
import { ConfirmDialog } from './ConfirmDialog'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

function Harness({ onCloseAutoFocus }: { onCloseAutoFocus?: (event: Event) => void }) {
  return (
    <Dialog>
      <DialogTrigger>Open terms</DialogTrigger>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Terms</DialogTitle>
        </DialogHeader>
        <DialogDescription>Read before you sell.</DialogDescription>
        <DialogFooter meta="Step 1 of 2">
          <DialogClose>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog state matrix', () => {
  it.each([
    ['sm', { size: 'sm' as const }],
    ['md', {}],
    ['lg', { size: 'lg' as const }],
    ['no close button', { showClose: false }],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { getByRole } = setup(
      <Dialog open>
        <DialogContent {...props}>
          <DialogTitle>Terms</DialogTitle>
          <DialogDescription>Body</DialogDescription>
          <DialogFooter stacked>
            <button type="button">Confirm</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
    expect(getByRole('dialog', { name: 'Terms' })).toBeTruthy()
    await expectNoAxeViolations(document.body)
  })

  it('the default panel keeps its class list', () => {
    const { getByRole } = setup(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Terms</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    expect(classList(getByRole('dialog'))).toMatchInlineSnapshot(`
      [
        "-translate-x-1/2",
        "-translate-y-1/2",
        "bg-highest",
        "border",
        "border-border",
        "data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0",
        "data-[state=closed]:zoom-out-95",
        "data-[state=open]:animate-in",
        "data-[state=open]:fade-in-0",
        "data-[state=open]:zoom-in-95",
        "fixed",
        "flex",
        "flex-col",
        "gap-md",
        "left-1/2",
        "max-w-[26.25rem]",
        "motion-reduce:animate-none",
        "p-md",
        "rounded-lg",
        "top-1/2",
        "w-[calc(100vw-var(--spacing-lg)*2)]",
        "z-90",
      ]
    `)
  })
})

describe('Dialog behaviour', () => {
  it('Enter on the trigger opens; the footer close button closes and focus returns', async () => {
    const { user, getByRole, queryByRole } = setup(<Harness />)
    await user.tab()
    await user.keyboard('{Enter}')
    expect(getByRole('dialog', { name: 'Terms' })).toBeTruthy()
    expect(getByRole('dialog').contains(document.activeElement)).toBe(true)
    await user.click(getByRole('button', { name: 'Done' }))
    expect(queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(getByRole('button', { name: 'Open terms' }))
  })

  it('Tab stays inside the open dialog', async () => {
    const { user, getByRole } = setup(<Harness />)
    await user.click(getByRole('button', { name: 'Open terms' }))
    const dialog = getByRole('dialog')
    for (let i = 0; i < 4; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('Escape closes and the X closes', async () => {
    const { user, getByRole, queryByRole } = setup(<Harness />)
    await user.click(getByRole('button', { name: 'Open terms' }))
    await user.keyboard('{Escape}')
    expect(queryByRole('dialog')).toBeNull()
    await user.click(getByRole('button', { name: 'Open terms' }))
    await user.click(getByRole('button', { name: 'Close' }))
    expect(queryByRole('dialog')).toBeNull()
  })

  it('controlled: open wins and onOpenChange reports false', async () => {
    const onOpenChange = vi.fn()
    const { user, getByRole } = setup(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Terms</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(getByRole('dialog')).toBeTruthy()
  })

  it('a caller that prevents the close focus keeps focus where it chose', async () => {
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault())
    const { user, getByRole } = setup(<Harness onCloseAutoFocus={onCloseAutoFocus} />)
    await user.click(getByRole('button', { name: 'Open terms' }))
    await user.keyboard('{Escape}')
    expect(onCloseAutoFocus).toHaveBeenCalled()
    expect(document.activeElement).not.toBe(getByRole('button', { name: 'Open terms' }))
  })

  it('an opener that left the page is not refocused', async () => {
    function Vanishing() {
      const [shown, setShown] = React.useState(true)
      return (
        <>
          {shown && (
            <button type="button" onClick={() => setShown(false)}>
              Opener
            </button>
          )}
          <Dialog open={!shown} onOpenChange={(open) => setShown(!open)}>
            <DialogContent>
              <DialogTitle>Terms</DialogTitle>
              <DialogDescription>Body</DialogDescription>
            </DialogContent>
          </Dialog>
        </>
      )
    }
    const { user, getByRole, queryByRole } = setup(<Vanishing />)
    await user.click(getByRole('button', { name: 'Opener' }))
    await user.keyboard('{Escape}')
    expect(queryByRole('dialog')).toBeNull()
    expect(document.activeElement).not.toBeNull()
  })
})

describe('Dialog slots', () => {
  it('header, title, description and footer meta render what they are given', () => {
    const { getByRole, getByText } = setup(
      <Dialog open>
        <DialogContent>
          <DialogHeader className="extra-head">
            <DialogTitle>Terms</DialogTitle>
          </DialogHeader>
          <DialogDescription>Read it</DialogDescription>
          <DialogFooter meta={<b>Saved</b>}>
            <button type="button">Go</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
    expect(getByRole('heading', { name: 'Terms' }).parentElement!.className).toContain('extra-head')
    expect(getByText('Read it')).toBeTruthy()
    expect(getByText('Saved')).toBeTruthy()
    expect(getByRole('button', { name: 'Go' })).toBeTruthy()
  })
})

describe('ConfirmDialog', () => {
  it('confirm and cancel each fire once; closed renders nothing', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { user, getByRole, queryByRole, rerender } = setup(
      <ConfirmDialog
        open
        title="Delete lot"
        body="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    await user.click(getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await user.click(getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    rerender(
      <ConfirmDialog
        open={false}
        title="Delete lot"
        body="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    expect(queryByRole('alertdialog')).toBeNull()
  })

  it('pending blocks a second confirm', async () => {
    const onConfirm = vi.fn()
    const { user, getByRole } = setup(
      <ConfirmDialog
        open
        pending
        title="Delete lot"
        body="Body"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    )
    await user.click(getByRole('button', { name: 'Delete' }))
    expect(onConfirm).not.toHaveBeenCalled()
    await expectNoAxeViolations(document.body)
  })
})
