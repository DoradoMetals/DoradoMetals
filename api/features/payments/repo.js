// Selects which schema payments reads and writes.
//
//   PAYMENTS_SOURCE=exchange  (default) exchange.payment_intents
//   PAYMENTS_SOURCE=dual                writes both, reads exchange
//
// exchange keeps one row per Stripe intent with the status, the amounts and the
// instrument all inline. The new schema separates them: payments.intents is what
// was asked for, payments.attempts is what was tried and carries the provider's
// reference, payments.settlements is what actually moved, and payments.details
// is the instrument.
//
// There is deliberately no `next`. This feature writes, and writing only to the
// new schema is the one-way door. repo.next.ts exists so the diff can compare
// the two before anything is promoted.
//
// Three migrations exist because writing this split found the schema could not
// express what the code does: 075/076 added session_id, user_id and type, which
// retrievePaymentIntent keys on, and 077/078 gave payments.details a
// provider_ref, which is what updateMethod keys on. Both had been declared
// "no home" by an audit that reads data and cannot read callers.
import * as exchange from "#features/payments/repo.exchange.js";
import * as dual from "#features/payments/repo.dual.js";

const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.PAYMENTS_SOURCE ?? "")
  ? process.env.PAYMENTS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const retrievePaymentIntent = impl.retrievePaymentIntent;
export const getVerbatimByIntentId = impl.getVerbatimByIntentId;
export const createPaymentIntent = impl.createPaymentIntent;
export const updatePaymentIntent = impl.updatePaymentIntent;
export const updateMethod = impl.updateMethod;
export const attachOrder = impl.attachOrder;
export const attachCustomerToUser = impl.attachCustomerToUser;
export const billingIdentityFor = impl.billingIdentityFor;
export const getPaymentIntentFromSalesOrderId = impl.getPaymentIntentFromSalesOrderId;
