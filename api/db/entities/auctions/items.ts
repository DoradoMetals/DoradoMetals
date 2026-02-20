import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Auction } from '@/db/entities/auctions/auctions';

@Entity({ tableName: 'items', schema: 'auctions' })
export class AuctionItem {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'uuid', nullable: true })
  bullion_id?: string;

  @Property({ type: 'uuid', nullable: true })
  metal_id?: string;

  @ManyToOne(() => Auction, { fieldName: 'auction_id' })
  auction!: Auction;

  @Property({ type: 'bigint' })
  number!: number;

  @Property({ type: 'text', nullable: true })
  buyer_email?: string;

  @Property({ type: 'text', nullable: true })
  buyer_name?: string;

  @Property({ type: 'boolean', default: false })
  sold!: boolean;

  @Property({ type: 'numeric', nullable: true })
  starting_bid?: number;

  @Property({ type: 'numeric', nullable: true })
  ending_bid?: number;

  @Property({ type: 'numeric' })
  quantity!: number;
}
