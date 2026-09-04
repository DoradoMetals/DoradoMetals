import { Conflict, Invalid, NotFound } from "#shared/errors.ts";
import type {
  Address, AddressBookActions, AddressBookEntry, AddressPatch, AddressWriteColumns,
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

export function actionsFor(link: UserAddress, locked: boolean): AddressBookActions {
  return {
    edit: !locked,
    remove: !locked,
    set_default: !link.default_shipping,
  };
}

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

export function byDefaultThenRecipient(a: AddressBookEntry, b: AddressBookEntry): number {
  return (
    Number(b.user_address.default_shipping) - Number(a.user_address.default_shipping) ||
    (a.user_address.recipient_name ?? "").localeCompare(b.user_address.recipient_name ?? "") ||
    a.address.id.localeCompare(b.address.id)
  );
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
