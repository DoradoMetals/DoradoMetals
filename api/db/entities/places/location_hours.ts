import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Location } from '@/db/entities/places/locations';

@Entity({ tableName: 'location_hours', schema: 'places' })
export class LocationHour {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Location, { fieldName: 'location_id' })
  location!: Location;

  @Property({ type: 'smallint' })
  weekday!: number;

  @Property({ type: 'time', nullable: true })
  open_time?: string;

  @Property({ type: 'time', nullable: true })
  close_time?: string;

  @Property({ type: 'smallint', nullable: true })
  sort_order?: number;

  @Property({ type: 'text', nullable: true })
  notes?: string;
}
