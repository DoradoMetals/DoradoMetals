import { Button } from '../button/Button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from './Dialog'

export type ConfirmDialogProps = {
  open: boolean
  title: React.ReactNode
  body: React.ReactNode
  confirmLabel: string
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent role="alertdialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            intent="danger"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
