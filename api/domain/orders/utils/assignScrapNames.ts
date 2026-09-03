// "Gold Item 1", "Gold Item 2", "Silver Item 1" - the labels a customer reads
// on their packing list and invoice.
//
// The names are display only. Nothing stores them, which is why `name` is
// optional on the composed scrap object: it is the one field on it the database
// never supplies.
import type {
  ComposedItem as PurchaseOrderItem,
  ComposedScrap as ScrapOnOrderItem,
} from "#domain/orders/compose.ts";

// A line that has survived the filter below. Narrowing `metal` to a string is
// the whole point of that filter, and saying so here is what lets the sort and
// the grouping index by it without a cast.
type ScrapItem = PurchaseOrderItem & {
  scrap: ScrapOnOrderItem & { metal: string; name?: string };
};

export function assignScrapItemNames(scrapItems: PurchaseOrderItem[]): ScrapItem[] {
  const metalOrder = ["Gold", "Silver", "Platinum", "Palladium"];

  // The type predicate states what the truthiness check already does. `metal`
  // is nullable on every scrap object - a bullion line carries an object of
  // nulls rather than null - so this is the step that makes the rest safe.
  const validScrapItems = scrapItems.filter(
    (item): item is ScrapItem => Boolean(item.scrap?.metal)
  );

  // A metal outside metalOrder gets indexOf -1 and therefore sorts ahead of
  // gold. Left as it is: production's scrap is 65 gold, 38 silver, 1 palladium
  // and 1 platinum, and exchange.metals holds no fifth metal for a line to be,
  // so the branch is unreachable rather than tolerated.
  validScrapItems.sort((a: ScrapItem, b: ScrapItem) => {
    const indexA = metalOrder.indexOf(a.scrap.metal);
    const indexB = metalOrder.indexOf(b.scrap.metal);
    return indexA - indexB;
  });

  const grouped: Record<string, ScrapItem[]> = {};

  validScrapItems.forEach((item: ScrapItem) => {
    const metal = item.scrap.metal;
    if (!grouped[metal]) grouped[metal] = [];
    grouped[metal].push(item);
  });

  // NAMED IN PLACE, not spread into a copy. The lines came from the composed
  // read this document is being rendered from and nothing else holds them, so a
  // copy would only be a second object to keep in step.
  for (const item of validScrapItems) {
    const metal = item.scrap.metal;
    item.scrap.name = `${metal} Item ${grouped[metal].indexOf(item) + 1}`;
  }
  return validScrapItems;
}
