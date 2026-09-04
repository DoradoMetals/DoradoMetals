// anAddress - a postal address and the link that gives it an owner.
//
// TWO TABLES, because that is what an address IS here: `places.addresses`
// holds the postal facts and has no user_id at all, and
// `places.user_addresses` holds the ownership, the label and the default
// flag. A test that wants "this customer's address" needs both, and forgetting
// the second is how a fixture ends up owned by nobody.
//
// Both go through their repos, so migration 116's trigger stamps them.
import type { PoolClient } from "pg";
import { anId, aTag } from "#shared/testing/builders/ids.ts";
import * as addresses from "#db/places/addresses/repo.ts";
import * as userAddresses from "#db/places/user-addresses/repo.ts";
import type { BuiltUser } from "#shared/testing/builders/users.ts";

export type BuiltAddress = {
  id: string;
  user_id: string;
  line_1: string;
  city: string;
  state: string;
  zip: string;
  recipient_name: string;
  label: string;
};

export type AddressOptions = {
  id?: string;
  line_1?: string;
  line_2?: string | null;
  city?: string;
  // A REAL two-letter code, not a placeholder: the sales-tax rules match on
  // state, so "XX" silently prices at zero.
  state?: string;
  zip?: string;
  country?: string;
  country_code?: string;
  phone_number?: string | null;
  recipient_name?: string;
  label?: string;
  default_shipping?: boolean;
};

export async function anAddress(
  c: PoolClient, user: BuiltUser | { id: string }, options: AddressOptions = {}
): Promise<BuiltAddress> {
  const tag = aTag();
  const id = options.id ?? anId();
  const row = await addresses.create(
    id,
    {
      line_1: options.line_1 ?? `${tag} Test Street`,
      line_2: options.line_2 ?? null,
      city: options.city ?? "Dallas",
      state: options.state ?? "TX",
      country: options.country ?? "United States",
      country_code: options.country_code ?? "US",
      zip: options.zip ?? "75201",
      phone_number: options.phone_number ?? "2145550100",
    },
    c
  );
  // WHO SIGNS FOR THE PARCEL and what the book calls it are two facts
  // (migration 126); a fixture that sets only one leaves the other null.
  const recipient_name = options.recipient_name ?? `Test Recipient ${tag}`;
  const label = options.label ?? `Test Address ${tag}`;
  await userAddresses.create(
    anId(), row.id, user.id,
    {
      recipient_name, label,
      default_shipping: options.default_shipping ?? true,
      default_billing: options.default_shipping ?? true,
    },
    c
  );
  return {
    id: row.id,
    user_id: user.id,
    line_1: row.line_1 as string,
    city: row.city as string,
    state: row.state as string,
    zip: row.zip as string,
    recipient_name,
    label,
  };
}
