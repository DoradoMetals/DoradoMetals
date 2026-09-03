// The record of a send, written AFTER the send - the log of an irreversible
// act happens on the far side of it, never inside a transaction that could
// roll the record back while the mail stays sent (the sendOrderToSupplier
// lesson, inverted).
//
// BOTH OUTCOMES ARE ROWS (migration 090's design, decided with Jacob
// 2026-08-28): a refiner email that silently failed is exactly the incident
// this log exists to surface, so the failure goes in with its error text and
// the throw continues to the caller unchanged.
//
// A FAILED INSERT MUST NEVER BREAK A SEND. The mail is gone either way;
// losing the record is one row, breaking the caller un-reports an act that
// still happened. Everything here catches, reports to stderr, and returns.
import { reportError } from "#shared/observability/report.ts";
import query from "#shared/db/query.ts";
import { isTestRun } from "#shared/testing/is-test-run.ts";
import * as emails from "#db/media/emails/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type EmailKind =
  | "purchase_order_created"
  | "purchase_order_priced"
  | "sales_order_to_supplier"
  // migration 091: better-auth's verification mail is sent by a callback this
  // codebase owns, so it joins the trail like every other send.
  | "auth_verification";

// THE BASE and THE OUTCOME are two separate parameters rather than one merged
// record, so a caller building "the same send, failed" and "the same send,
// sent" never re-spells the base fields to attach an outcome - it calls
// recordEmail with the SAME base object twice, alongside whichever outcome
// happened.
type EmailBase = {
  kind: EmailKind;
  to: string;
  subject: string;
  order_id?: string | null;
  user_id?: string | null;
  pdf_id?: string | null;
};

type EmailOutcome =
  | { status: "sent"; provider_message_id?: string | null }
  | { status: "failed"; error?: string | null };

export async function recordEmail(
  base: EmailBase, outcome: EmailOutcome, executor?: Executor
): Promise<void> {
  // Same stance as persistPdf: a test exercises the trail through its own
  // transaction or not at all - never as committed rows in dev.
  if (isTestRun() && !executor) return;
  try {
    // An order that predates dual has no orders.orders row, and a refused FK
    // inside a caller's transaction would poison it (25P02) - so the link is
    // checked first and dropped if absent, never discovered by failing.
    const orderId = await linkableOrderId(base.order_id, executor);
    await emails.create({
      kind: base.kind,
      status: outcome.status,
      to_address: base.to,
      subject: base.subject,
      order_id: orderId,
      user_id: base.user_id,
      pdf_id: base.pdf_id,
      provider_message_id: outcome.status === "sent" ? outcome.provider_message_id : null,
      error: outcome.status === "failed" ? outcome.error : null,
    }, executor);
  } catch (err) {
    reportError({
      at: "media.emails.record",
      message:
        `the ${outcome.status} ${base.kind} email to ${base.to} was sent but not recorded - ` +
        `the message went out and this database has no row saying so`,
      err,
      extra: { kind: base.kind, status: outcome.status, to: base.to },
    });
  }
}

export async function linkableOrderId(
  order_id: string | null | undefined, executor?: Executor
): Promise<string | null> {
  if (!order_id) return null;
  try {
    const { rows } = await query("SELECT 1 FROM orders.orders WHERE id = $1", [order_id], executor);
    return rows.length ? order_id : null;
  } catch {
    return null;
  }
}

// nodemailer's result carries a messageId; a recorder transport may return
// anything at all. Read, never assert.
export const messageIdOf = (result: unknown): string | null => {
  const id = (result as { messageId?: unknown } | null | undefined)?.messageId;
  return typeof id === "string" ? id : null;
};
