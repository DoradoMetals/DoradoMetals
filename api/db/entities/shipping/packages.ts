import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { ShippingCarrier } from '@/db/entities/shipping/carriers';
import { Image } from '@/db/entities/core/images';

@Entity({ tableName: 'packages', schema: 'shipping' })
export class ShippingPackage {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => ShippingCarrier, { fieldName: 'carrier_id' })
  carrier!: ShippingCarrier;

  @ManyToOne(() => Image, { fieldName: 'image_id', nullable: true })
  image?: Image;

  @Property({ type: 'text' })
  length!: string;

  @Property({ type: 'text' })
  width!: string;

  @Property({ type: 'text' })
  height!: string;

  @Property({ type: 'timestamp' })
  created_at!: Date;

  @Property({ type: 'timestamp' })
  updated_at!: Date;
}
