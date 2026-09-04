// What a payout account has to say before it is worth storing. Pure: no
// database, no cipher, no request - so the shape of a refusal is testable
// without either.
//
// NOTHING HERE RETURNS A BANK NUMBER. It reads them to decide whether they are
// well-formed and answers a boolean or throws; the digits never leave the
// argument they arrived in.
import { Invalid, NotFound } from "#shared/errors.ts";
import type { CheckoutPayoutForm } from "@dorado/contracts";

// The two families a payout method belongs to. A bank method needs an account
// to move money into; an email method needs somebody to send it to.
const BANK_METHODS = new Set(["ACH", "WIRE"]);
const EMAIL_METHODS = new Set(["ECHECK", "DORADO_ACCOUNT"]);

export const isBankMethod = (method: string): boolean => BANK_METHODS.has(method);

// The last four digits are NOT a secret: they are what every order payload and
// the admin panel render, and the full numbers only ever go in sealed.
export function lastFour(value: string): string | null {
  return value.length >= 4 ? value.slice(-4) : null;
}

// THE FORM IS A COMPLETE DOCUMENT, NOT A PATCH. Switching from a bank method
// to an email one must CLEAR the bank name, and shared/db/patch.ts reads
// `undefined` as "not named" - so absence has to arrive as an explicit null.
export function cleared<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

// Refuses a form that cannot be paid out to. The method decides which fields
// are load-bearing, which is why this is one assertion and not four schemas.
export function assertPayableForm(form: CheckoutPayoutForm): string {
  const { method } = form;
  if (!method || !form.account_holder_name) {
    throw new Invalid("the payout needs a method and an account holder name");
  }
  if (BANK_METHODS.has(method)) {
    if (!form.routing_number || !form.account_number || !form.bank_name) {
      throw new Invalid(`${method} needs a bank name, a routing number and an account number`);
    }
    if (!/^\d{9}$/.test(form.routing_number)) {
      throw new Invalid("the routing number must be 9 digits");
    }
    if (!/^\d+$/.test(form.account_number)) {
      throw new Invalid("the account number must be digits");
    }
    return method;
  }
  if (EMAIL_METHODS.has(method)) {
    if (!form.payout_email) throw new Invalid(`${method} needs an email address`);
    return method;
  }
  throw new Invalid(`no such payout method: ${method}`);
}

// THE METHOD ROW THE FORM NAMES. A method that resolves to nothing writes
// nothing: an account with no method is a payout with nowhere to go. The form
// already passed assertPayableForm, so this refuses the CATALOGUE rather than
// the document - the label is known and payments.methods has no row for it.
export function assertResolvedMethod<T extends { id: string }>(
  method: string, resolved: T | undefined
): T {
  if (!resolved) throw new Invalid(`no such payout method: ${method}`);
  return resolved;
}

// A write that named a row that is not there. The repo answers the row it
// wrote (ruling 65), so `undefined` is the id matching nothing rather than a
// boolean the caller has to go and interpret.
export function assertWrittenDetails<T>(details_id: string, row: T | undefined): T {
  if (!row) throw new NotFound(`no payout ${details_id}`);
  return row;
}
