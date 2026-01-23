'use client'

import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import type {
  Auction,
  AuctionItem,
  CreateAuctionInput,
  CreateAuctionItemInput,
  CreateAuctionLotsInput,
  UpdateAuctionInput,
  UpdateAuctionItemInput,
} from '@/features/auctions/types'

export const useAuctions = () =>
  useApiQuery<Auction[]>({
    key: queryKeys.auctions(),
    url: '/auctions/get',
    requireAdmin: true,
  })

export const useAuction = (auction_id?: string) =>
  useApiQuery<Auction>({
    key: queryKeys.auction(auction_id ?? ''),
    url: '/auctions/one',
    requireAdmin: true,
    enabled: !!auction_id,
    params: () => ({
      auction_id: auction_id,
    }),
  })

export const useCreateAuction = () =>
  useApiMutation<Auction, CreateAuctionInput, Auction[]>({
    queryKey: queryKeys.auctions(),
    url: '/auctions/create',
    requireUser: true,
    optimistic: false,
    body: (_input) => ({
      status: 'draft',
      scheduled_date: null,
    }),
  })

export const useUpdateAuction = () =>
  useApiMutation<Auction, UpdateAuctionInput, Auction[]>({
    queryKey: queryKeys.auctions(),
    url: '/auctions/update',
    requireAdmin: true,
    listAction: 'upsert',
    body: (input) => ({
      auction_id: input.id,
      status: input.status,
      scheduled_date: input.scheduled_date ?? null,
    }),
    optimisticUpdater: (list, patch) => {
      const items = list ?? []
      return items.map((a) =>
        a.id === patch.id
          ? {
              ...a,
              status: patch.status ?? a.status,
              scheduled_date:
                patch.scheduled_date === undefined ? a.scheduled_date : patch.scheduled_date,
            }
          : a
      )
    },
  })

export const useDeleteAuction = () =>
  useApiMutation<string, { id: string }, Auction[]>({
    queryKey: queryKeys.auctions(),
    method: 'DELETE',
    url: '/auctions/delete',
    requireAdmin: true,
    listAction: 'delete',
    body: (input) => ({
      auction_id: input.id,
    }),
  })

export const useAuctionItems = (auction_id?: string) =>
  useApiQuery<AuctionItem[]>({
    key: queryKeys.auctionItems(auction_id ?? ''),
    url: '/auctions/items/get',
    requireAdmin: true,
    enabled: !!auction_id,
    params: () => ({
      auction_id: auction_id,
    }),
  })

export const useCreateAuctionItem = (auction_id: string) =>
  useApiMutation<AuctionItem, Omit<CreateAuctionItemInput, 'auction_id'>, AuctionItem[]>({
    queryKey: queryKeys.auctionItems(auction_id),
    url: '/auctions/items/create',
    requireAdmin: true,
    optimistic: false,
    body: (item) => ({
      auction_id: auction_id,
      item,
    }),
  })

export const useCreateAuctionLots = (auction_id: string) =>
  useApiMutation<AuctionItem[], CreateAuctionLotsInput, AuctionItem[]>({
    queryKey: queryKeys.auctionItems(auction_id),
    url: '/auctions/items/create_lots',
    requireAdmin: true,
    optimistic: true,
    listInsertPosition: 'end',
    body: (lots) => ({
      auction_id: auction_id,
      lots,
    }),
  })

export const useUpdateAuctionItem = (auction_id: string) =>
  useApiMutation<AuctionItem, UpdateAuctionItemInput, AuctionItem[]>({
    queryKey: queryKeys.auctionItems(auction_id),
    url: '/auctions/items/update',
    requireAdmin: true,
    optimisticUpdater: (list, patch) => {
      const items = list ?? []
      return items.map((i) =>
        i.id === patch.id
          ? {
              ...i,
              buyer_email: patch.buyer_email ?? i.buyer_email,
              buyer_name: patch.buyer_name ?? i.buyer_name,
              sold: patch.sold ?? i.sold,
              starting_bid:
                patch.starting_bid === undefined ? i.starting_bid : String(patch.starting_bid),
              ending_bid: patch.ending_bid === undefined ? i.ending_bid : String(patch.ending_bid),
              quantity: patch.quantity === undefined ? i.quantity : String(patch.quantity),
            }
          : i
      )
    },
    body: (patch) => ({
      item_id: patch.id,
      patch: {
        buyer_email: patch.buyer_email,
        buyer_name: patch.buyer_name,
        sold: patch.sold,
        starting_bid: patch.starting_bid ?? null,
        ending_bid: patch.ending_bid ?? null,
        quantity: patch.quantity ?? null,
      },
    }),
  })

export const useDeleteAuctionItem = (auction_id: string) =>
  useApiMutation<string, { id: string, auction_id: string }, AuctionItem[]>({
    queryKey: queryKeys.auctionItems(auction_id),
    method: 'DELETE',
    url: '/auctions/items/delete',
    requireAdmin: true,
    listAction: 'delete',
    body: (input) => ({
      item_id: input.id,
      auction_id: input.auction_id
    }),
  })

export const useAllAuctionItems = () =>
  useApiQuery<AuctionItem[]>({
    key: queryKeys.auctionItems('all'),
    url: '/auctions/items/get_all',
    requireAdmin: true,
  })


export const useMoveAuctionItem = (auction_id: string) =>
  useApiMutation<AuctionItem[], { item_id: string; over_item_id: string }, AuctionItem[]>({
    queryKey: queryKeys.auctionItems(auction_id),
    url: '/auctions/items/move',
    requireAdmin: true,
    optimistic: false,
    body: (input) => ({
      auction_id,
      item_id: input.item_id,
      over_item_id: input.over_item_id,
    }),
  })

  export const useReorderAuctionItems = (auction_id: string) =>
  useApiMutation<AuctionItem[], { ordered_ids: string[] }, AuctionItem[]>({
    queryKey: queryKeys.auctionItems(auction_id),
    url: '/auctions/items/reorder',
    requireAdmin: true,
    optimistic: false,
    body: (input) => ({
      auction_id,
      ordered_ids: input.ordered_ids,
    }),
  })

export const useDeleteAuctionItems = (auction_id: string) =>
  useApiMutation<AuctionItem[], { item_ids: string[] }, AuctionItem[]>({
    queryKey: queryKeys.auctionItems(auction_id),
    url: '/auctions/items/delete_many',
    requireAdmin: true,
    optimistic: false,
    body: (input) => ({
      auction_id,
      item_ids: input.item_ids,
    }),
  })