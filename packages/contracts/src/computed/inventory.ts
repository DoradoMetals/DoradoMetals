import { z } from 'zod/v4'
import { InventoryLotView, Lot } from '../lots/items.js'
import { PoolBalance } from '../refining/pool.js'
import { Action } from './orders.js'

export const LotActions = z.array(Action)
export type LotActions = z.infer<typeof LotActions>

export const LotTimelineStep = z.object({
  step: z.enum(['Received', 'Assayed', 'Sent', 'Settled', 'Sold', 'Split', 'Combined']),
  at: z.string(),
  actor_id: z.string().uuid().nullable(),
})
export type LotTimelineStep = z.infer<typeof LotTimelineStep>

export const LotLineageRef = z.object({
  id: Lot.shape.id,
  reference: z.string().nullable(),
})
export type LotLineageRef = z.infer<typeof LotLineageRef>

export const LotWhereOrder = z.object({
  id: Lot.shape.id,
  number: z.number().int(),
  reference: z.string(),
  direction: z.string(),
})
export type LotWhereOrder = z.infer<typeof LotWhereOrder>

export const LotWhereRefiningOrder = z.object({
  id: Lot.shape.id,
  number: z.number().int(),
  reference: z.string(),
  state: z.string(),
})
export type LotWhereRefiningOrder = z.infer<typeof LotWhereRefiningOrder>

export const LotWhereRefiner = z.object({
  id: Lot.shape.id,
  name: z.string().nullable(),
})
export type LotWhereRefiner = z.infer<typeof LotWhereRefiner>

export const LotWhere = z.object({
  order: LotWhereOrder.nullable(),
  refining_order: LotWhereRefiningOrder.nullable(),
  refiner: LotWhereRefiner.nullable(),
})
export type LotWhere = z.infer<typeof LotWhere>

export const LotWorthSettled = z.object({
  post_melt: z.number().nullable(),
  purity: z.number().nullable(),
  content: z.number().nullable(),
  settled_at: z.string().nullable(),
})
export type LotWorthSettled = z.infer<typeof LotWorthSettled>

export const LotWorth = z.object({
  declared_content: Lot.shape.declared_content,
  content: Lot.shape.content,
  variance: Lot.shape.content,
  premium: z.number().nullable(),
  price: z.number().nullable(),
  payable: z.number().nullable(),
  settled: LotWorthSettled.nullable(),
})
export type LotWorth = z.infer<typeof LotWorth>

export const LotLineage = z.object({
  split_from_id: Lot.shape.split_from_id,
  split_from_reference: z.string().nullable(),
  children: z.array(LotLineageRef),
  combined_into_id: Lot.shape.combined_into_id,
  combined_into_reference: z.string().nullable(),
  combined_from: z.array(LotLineageRef),
})
export type LotLineage = z.infer<typeof LotLineage>

export const LotDetailFacts = z.object({
  lot: InventoryLotView,
  where: LotWhere,
  worth: LotWorth,
  lineage: LotLineage,
  timeline: z.array(LotTimelineStep),
})
export type LotDetailFacts = z.infer<typeof LotDetailFacts>

export const LotDetail = LotDetailFacts.extend({ actions: LotActions })
export type LotDetail = z.infer<typeof LotDetail>

export const InventoryMetal = z.object({
  metal_id: z.string(),
  on_hand_lots: z.number().int(),
  on_hand_content: z.number(),
  est_value: z.number().nullable(),
})
export type InventoryMetal = z.infer<typeof InventoryMetal>

export const InventorySummary = z.object({
  metals: z.array(InventoryMetal),
  pool: z.array(PoolBalance),
})
export type InventorySummary = z.infer<typeof InventorySummary>
