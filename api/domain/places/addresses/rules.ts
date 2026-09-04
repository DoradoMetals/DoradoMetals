// WHAT AN ADDRESS BOOK MEANS, as pure functions over rows already loaded.
// Nothing here reads a database, so every rule is testable without Postgres.
//
// Ruling 65: this is the only file under domain/places that throws. An entry's
// `actions` and the assert that refuses the same call are a few lines apart on
// purpose - a button the wire OFFERS is a call the use case ACCEPTS.
import { Conflict, Invalid, NotFound } from "#shared/errors.ts";
import type {
  Address, AddressBookActions, AddressBookEntry, AddressPatch, AddressWriteColumns,
  UserAddress, UserAddressPatch, UserAddressWriteColumns,
} from "@dorado/contracts";

// ---------------------------------------------------------------- refusals

// places.addresses has no user_id, so the write cannot refuse a stranger's
// address by itself: the caller's LINK is the ownership proof, and its absence
// is a 404 rather than a 403 - naming an address you cannot see should not
// tell you it exists.
export function assertInBook(
  address_id: string, link: UserAddress | undefined
): UserAddress {
  if (!link) throw new NotFound(`no address ${address_id} in this address book`);
  return link;
}

// AN UNFINISHED ORDER IS ALREADY GOING SOMEWHERE. Both the edit and the delete
// refuse on the same fact, and `actionsFor` reports it as two booleans.
export function assertNotOnAnActiveOrder(locked: boolean, verb: "edited" | "deleted"): void {
  if (locked) {
    throw new Conflict(`Address cannot be ${verb} because it is associated with an active order.`);
  }
}

export function assertAddress(
  address_id: string, row: Address | undefined
): Address {
  if (!row) throw new NotFound(`no address ${address_id}`);
  return row;
}

// A LOOKUP NEEDS SOMETHING TO LOOK UP. Google bills per request and answers a
// blank query with a 400, so the refusal is ours and it is free.
export function assertSearchText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 3) {
    throw new Invalid("a place search needs at least three characters");
  }
  return trimmed;
}

// -------------------------------------------------------------- the decisions

// THE FIRST ADDRESS IS THE DEFAULT, and this was the browser's rule
// (`mustBeDefault = isNewAddress && addresses.length === 0`, with the switch
// disabled to enforce it). A book with nothing in it has no default, so every
// downstream "their default address" read answered null and checkout could not
// preselect. The server decides it now, whatever client wrote the row.
export function defaultOnCreate(bookSize: number, asked: boolean | null | undefined): boolean {
  return bookSize === 0 || asked === true;
}

// WHAT MAY BE DONE TO AN ENTRY. `edit` and `remove` mirror
// assertNotOnAnActiveOrder; `set_default` is false for the one it already is,
// which the card used to work out from a flag it joined client-side.
export function actionsFor(link: UserAddress, locked: boolean): AddressBookActions {
  return {
    edit: !locked,
    remove: !locked,
    set_default: !link.default_shipping,
  };
}

// The wire keeps the two rows apart: a link nested inside an address is the
// smearing the places split exists to end.
export function entry(address: Address, link: UserAddress, locked: boolean): AddressBookEntry {
  return {
    address,
    user_address: {
      address_id: link.address_id,
      user_id: link.user_id,
      recipient_name: link.recipient_name,
      label: link.label,
      default_shipping: link.default_shipping,
    },
    actions: actionsFor(link, locked),
  };
}

// Default first, then by whoever receives the parcel - DESC on a boolean puts
// true first. The list was sorted in the browser, twice, with two different
// tie-breaks.
export function byDefaultThenRecipient(a: AddressBookEntry, b: AddressBookEntry): number {
  return (
    Number(b.user_address.default_shipping) - Number(a.user_address.default_shipping) ||
    (a.user_address.recipient_name ?? "").localeCompare(b.user_address.recipient_name ?? "") ||
    a.address.id.localeCompare(b.address.id)
  );
}

// ------------------------------------------------------------ patch shaping

// EDITING AN ADDRESS UN-VALIDATES IT. The postal fields moved, so the
// carrier's last answer about them is stale; the validation pass writes the
// real values back through its own update.
export function editedColumns(patch: AddressPatch): AddressWriteColumns {
  return {
    line_1: patch.line_1,
    line_2: patch.line_2,
    city: patch.city,
    state: patch.state,
    country: patch.country,
    zip: patch.zip,
    country_code: patch.country_code,
    phone_number: patch.phone_number,
    is_valid: false,
    is_residential: false,
  };
}

// WHAT A CALLER MAY CHANGE ABOUT THEIR LINK: the recipient and the nickname.
// NEITHER DEFAULT FLAG IS HERE. Turning one on goes through setDefault's
// clear-then-mark, so a second default cannot exist even for the length of one
// statement - and the old update wrote `default_shipping: false` first, which
// silently un-defaulted an address whenever its recipient was edited.
export function linkColumns(
  patch: UserAddressPatch | undefined
): UserAddressWriteColumns {
  return { recipient_name: patch?.recipient_name, label: patch?.label };
}

