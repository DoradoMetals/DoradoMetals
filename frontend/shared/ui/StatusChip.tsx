import { cn } from '@/shared/utils/cn'

// The drawer-header status pill (Active/Inactive, Converted, Public/Hidden)
// that was inlined in every admin drawer. Green for the positive state, red
// for the negative one. `glass` swaps to the on-glass utility pair (the
// product drawer's look); `className` carries per-site size tweaks
// (text-sm/text-base, h-fit, gap-1).
type StatusChipProps = {
  positive: boolean
  glass?: boolean
  className?: string
  children: React.ReactNode
}

export default function StatusChip({ positive, glass = false, className, children }: StatusChipProps) {
  return (
    <div
      className={cn(
        'px-2 py-1 border-1 rounded-lg flex justify-center items-center font-semibold',
        className,
        glass
          ? positive
            ? 'success-on-glass'
            : 'destructive-on-glass'
          : positive
            ? 'bg-success/20 text-success border-success'
            : 'bg-destructive/20 text-destructive border-destructive'
      )}
    >
      {children}
    </div>
  )
}
