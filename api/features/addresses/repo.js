// Selects which schema the addresses feature uses.
//
//   ADDRESSES_SOURCE=exchange   (default) read exchange, write exchange
//   ADDRESSES_SOURCE=dual                 read places, write BOTH
//
// `next` is deliberately absent from the switch: writing only to the new schema
// is the one-way door and should be a separate change.
//
// This feature is what resolves the address id an order returns. The order
// reads hand back the address-book id rather than the snapshot's precisely so
// getFromId can find it, and because the address book kept its exchange ids
// that still holds when this is promoted. Once it is, the order reads could
// return the snapshot id instead - which is the better answer, since the
// snapshot is what that order was actually sent to - but that is a separate
// change with its own tests. See FOLLOWUPS.
//
// Gate on `pnpm --filter @dorado/api diff addresses` before promoting.
import * as exchange from "#features/addresses/repo.exchange.js";
import * as dual from "#features/addresses/repo.dual.js";

// An unrecognised value is NOT an error: the Object.hasOwn check below falls
// back to `exchange`, silently. So a setting listed here that SOURCES does not
// contain reads as a working promotion and is not one.
const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.ADDRESSES_SOURCE ?? "")
  ? process.env.ADDRESSES_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const list = impl.list;
export const getFromId = impl.getFromId;
export const isActive = impl.isActive;
export const create = impl.create;
export const update = impl.update;
export const updateValidation = impl.updateValidation;
export const remove = impl.remove;
export const setDefault = impl.setDefault;
