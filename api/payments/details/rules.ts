import { Invalid, NotFound } from "#shared/errors.ts";
import type { CheckoutPayoutForm, PaymentDetailsPatch, PaymentDetailsView } from "@dorado/contracts";

const BANK_METHODS = new Set(["ACH", "WIRE"]);
const EMAIL_METHODS = new Set(["ECHECK", "DORADO_ACCOUNT"]);

export const isBankMethod = (method: string): boolean => BANK_METHODS.has(method);

export function lastFour(value: string): string | null {
  return value.length >= 4 ? value.slice(-4) : null;
}

export function cleared<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

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

export function assertResolvedMethod<T extends { id: string }>(
  method: string, resolved: T | undefined
): T {
  if (!resolved) throw new Invalid(`no such payout method: ${method}`);
  return resolved;
}

export function assertWrittenDetails<T>(details_id: string, row: T | undefined): T {
  if (!row) throw new NotFound(`no payout ${details_id}`);
  return row;
}

export function assertWritablePayout(
  payout_id: string, payout: PaymentDetailsView | undefined
): string {
  const { order } = assertPayout(payout_id, payout);
  if (!order?.order_id) {
    throw new Invalid(
      `payout ${payout_id} is attached to no order, so its writes have no subject`
    );
  }
  return order.order_id;
}

export function assertPayout(
  payout_id: string, payout: PaymentDetailsView | undefined
): PaymentDetailsView {
  if (!payout) throw new NotFound(`no payout ${payout_id}`);
  return payout;
}

export function assertNamesAField(patch: PaymentDetailsPatch): PaymentDetailsPatch {
  if (Object.keys(patch).length === 0) {
    throw new Invalid("the document names no field to write");
  }
  return patch;
}

export function assertWaivable(payout_id: string, written: boolean): void {
  if (!written) {
    throw new Invalid(
      `payout ${payout_id} is not on a purchase order, so its fee cannot be waived`
    );
  }
}
