import { Badge, Button, EmptyState, Pagination, Text } from '@dorado/components'
import { Package } from '@dorado/icons'
import type { SpotAdjustmentRead } from '@dorado/contracts'

import { adjustmentAmount, adjustmentExpiry } from '../_lib'

export type AdjustmentRowsProps = {
  adjustments: SpotAdjustmentRead[]
  mobile: boolean
  page?: number
  pageCount?: number
  onPageChange?: (page: number) => void
  onRemove: (adjustment: SpotAdjustmentRead) => void
}

function Row({
  adjustment,
  mobile,
  onRemove,
}: {
  adjustment: SpotAdjustmentRead
  mobile: boolean
  onRemove: (adjustment: SpotAdjustmentRead) => void
}) {
  const by = adjustment.updated_by || adjustment.created_by || 'System'
  const expiry = adjustmentExpiry(adjustment)
  return (
    <li className="flex flex-col gap-sm py-xs-plus">
      <div className="flex flex-col gap-3xs">
        <div className="flex items-center justify-between gap-xs">
          <div className="flex items-center gap-xs">
            <Text variant="h5" as="h3">
              {adjustment.metal_id}
            </Text>
            <Text variant="small-medium" emphasis="default">
              {adjustmentAmount(adjustment)}
            </Text>
          </div>
          <div className="flex items-center gap-xs">
            <Button variant="tertiary" size="sm" onClick={() => onRemove(adjustment)}>
              Remove
            </Button>
            {adjustment.scope === 'Active' ? (
              <Badge intent="success">Active</Badge>
            ) : (
              <Badge intent="neutral">Dormant</Badge>
            )}
          </div>
        </div>
        <Text variant="micro">{adjustment.source_id}</Text>
      </div>
      {mobile ? (
        <>
          <Text variant="small-medium" emphasis="default">
            {by}
          </Text>
          <Text variant="micro">{expiry}</Text>
        </>
      ) : (
        <div className="flex items-center justify-between gap-md">
          <Text variant="small-medium" emphasis="default">
            {by}
          </Text>
          <Text variant="micro">{expiry}</Text>
        </div>
      )}
    </li>
  )
}

export function AdjustmentRows({
  adjustments,
  mobile,
  page,
  pageCount,
  onPageChange,
  onRemove,
}: AdjustmentRowsProps) {
  if (adjustments.length === 0) {
    return (
      <EmptyState
        icon={<Package />}
        title="No adjustments"
        description="Set one from a metal page when a feed needs correcting."
      />
    )
  }
  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-border">
        {adjustments.map((adjustment) => (
          <Row
            key={`${adjustment.metal_id}:${adjustment.source_id}`}
            adjustment={adjustment}
            mobile={mobile}
            onRemove={onRemove}
          />
        ))}
      </ul>
      {page !== undefined && pageCount !== undefined && onPageChange && (
        <div className="flex justify-center pt-sm">
          <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  )
}
