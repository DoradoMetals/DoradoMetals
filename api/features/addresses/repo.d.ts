import type { PoolClient } from "pg";
import type { AddressRow } from "./repo.next.ts";

/**
 * Types the address repo facade so callers get a row type instead of `any`.
 *
 * WHY THIS FILE EXISTS. repo.js selects its implementation with
 * `SOURCES[SOURCE]`, and a dynamic index erases the type - every export came
 * back as `any`, so `getFromId(...).state` compiled clean even though
 * `getFromId` returns a LIST and `.state` on a list is `undefined`.
 *
 * That is not hypothetical. features/sales-orders/service.js read exactly that,
 * in both createSalesOrder and adminCreateSalesOrder, and it is the state the
 * order is taxed in - so every order was taxed in no state at all and the rules
 * COALESCEd to a rate of zero. It arrived in cf724c4e, 6 January 2026.
 * features/sales-orders/address-state.test.js proves it.
 *
 * `getFromId` returning `AddressRow[]` is what makes that a compile error
 * rather than a silent zero - FOR TYPESCRIPT CALLERS. I first wrote "for every
 * caller, permanently", and that is wrong: tsconfig sets `checkJs: false`, so a
 * .js caller is never checked and this file does nothing for it. The caller
 * that actually had the bug, features/sales-orders/service.js, is JavaScript.
 * Proved by probing with a .js file rather than the .ts one I used first, which
 * is what made the claim look true.
 *
 * So the guard on that call site today is the narrower fix - calling
 * addressService.getAddressFromId, which returns `rows[0]` - plus
 * scripts/lint-row-vs-list.mjs, which is syntactic and does read .js. THIS FILE
 * BECOMES THE GUARD WHEN THE CALLER IS CONVERTED, which is the argument for
 * converting it.
 *
 * PROVED RATHER THAN ASSUMED, because an unresolved import in a declaration
 * file is not an error - every type it names silently becomes `any`, and
 * skipLibCheck means tsc never says so. The check that distinguishes the two is
 * a property access: `rows[0].nonexistent_field` must error. Assigning to a
 * number does not, since `any[]` is not a number either.
 */
export const activeSource: string;

export function list(userId: string): Promise<AddressRow[]>;
export function getFromId(address_id: string): Promise<AddressRow[]>;
export function isActive(args: { addressId: string; userId: string }): Promise<boolean>;
export function create(
  args: { address: Partial<AddressRow>; userId: string },
  executor?: PoolClient
): Promise<AddressRow>;
export function update(
  args: { address: Partial<AddressRow>; userId: string },
  executor?: PoolClient
): Promise<AddressRow>;
export function updateValidation(
  args: { addressId: string; is_valid: boolean; is_residential: boolean },
  executor?: PoolClient
): Promise<void>;
export function remove(
  args: { addressId: string; userId: string },
  executor?: PoolClient
): Promise<void>;
export function setDefault(
  args: { userId: string; addressId: string },
  executor?: PoolClient
): Promise<void>;
