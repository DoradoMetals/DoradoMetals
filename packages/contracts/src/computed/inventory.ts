import { z } from 'zod/v4'
import { InventoryLotView, Lot } from '../inventory/lots.js'
import { LotEdge } from '../inventory/lot_sources.js'
import { PoolBalance } from '../inventory/pool.js'
import { Action } from './orders.js'

export const LotActions = z.array(Action)
export type LotActions = z.infer<typeof LotActions>

export const LotTimelineStep = z.object({
  step: z.enum([
    'Received',
    'Assayed',
    'Confirmed',
    'Batched',
    'Sent',
    'Settled',
    'Sold',
    'Split',
    'Combined',
  ]),
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
  lot_id: Lot.shape.id,
  pre_melt: Lot.shape.pre_melt,
  post_melt: Lot.shape.post_melt,
  purity: Lot.shape.purity,
  content: Lot.shape.content,
  premium: Lot.shape.premium,
  settled_spot: Lot.shape.settled_spot,
  settled_at: Lot.shape.settled_at,
  share: Lot.shape.content,
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
  sources: z.array(LotEdge),
  derived: z.array(LotEdge),
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
