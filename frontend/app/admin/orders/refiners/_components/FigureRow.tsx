import { cn } from '@dorado/components'

export type FigureRowProps = {
  label: string
  value: string
  reduces?: boolean
}

export function FigureRow({ label, value, reduces = false }: FigureRowProps) {
  return (
    <div className="flex items-center justify-between gap-sm">
      <span className="text-small text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-small font-medium tabular-nums',
          reduces && value !== '—' ? 'text-destructive' : 'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function FigureField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3xs">
      <span className="text-micro text-muted-foreground">{label}</span>
      <span className="truncate text-small font-medium text-foreground tabular-nums">{value}</span>
    </div>
  )
}
