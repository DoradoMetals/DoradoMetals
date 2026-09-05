import { Conflict, Invalid, NotFound } from "#shared/errors.ts";
import type {
  Address, AddressBookActions, AddressBookEntryFacts, AddressPatch, AddressWriteColumns,
  UserAddress, UserAddressPatch, UserAddressWriteColumns,
} from "@dorado/contracts";

export function assertInBook(
  address_id: string, link: UserAddress | undefined
): UserAddress {
  if (!link) throw new NotFound(`no address ${address_id} in this address book`);
  return link;
}

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

export function assertSearchText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 3) {
    throw new Invalid("a place search needs at least three characters");
  }
  return trimmed;
}

export function defaultOnCreate(bookSize: number, asked: boolean | null | undefined): boolean {
  return bookSize === 0 || asked === true;
}

export function actionsFor(view: AddressBookEntryFacts): AddressBookActions {
  return {
    edit: !view.locked,
    remove: !view.locked,
    set_default: !view.user_address.default_shipping,
  };
}

export function assertEntry<T>(address_id: string, view: T | undefined): T {
  if (!view) throw new NotFound(`no address ${address_id} in this address book`);
  return view;
}

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

export function linkColumns(
  patch: UserAddressPatch | undefined
): UserAddressWriteColumns {
  return { recipient_name: patch?.recipient_name, label: patch?.label };
}
