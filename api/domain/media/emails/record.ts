// Written AFTER the send, never inside a transaction that could roll back while the mail stays sent. Best-effort - a failed record must not break the send.
import query from "#shared/db/query.ts";
import { isTestRun } from "#shared/testing/is-test-run.ts";
import * as emails from "#db/media/emails/repo.ts";
import type { PoolClient } from "pg";
import { attempt } from "#shared/attempt.ts";

type Executor = PoolClient | undefined;

export type EmailKind =
  | "purchase_order_created"
  | "purchase_order_priced"
  | "sales_order_to_supplier"
  // better-auth's verification mail is sent by a callback this codebase owns, so it joins the trail like every other send.
  | "auth_verification";

// Base and outcome are separate params so a caller can attach either outcome to the same base object without re-spelling its fields.
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
  if (isTestRun() && !executor) return;
  await attempt(`record ${outcome.status} ${base.kind} email to ${base.to}`, async () => {
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
  });
}

export async function linkableOrderId(
  order_id: string | null | undefined, executor?: Executor
): Promise<string | null> {
  if (!order_id) return null;
  const { rows } = await query("SELECT 1 FROM orders.orders WHERE id = $1", [order_id], executor);
  return rows.length ? order_id : null;
}

// nodemailer's result carries messageId; a recorder transport may return anything - read it, never assert it.
export const messageIdOf = (result: unknown): string | null => {
  const id = (result as { messageId?: unknown } | null | undefined)?.messageId;
  return typeof id === "string" ? id : null;
};
