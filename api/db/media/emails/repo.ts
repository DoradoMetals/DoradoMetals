// media.emails, and nothing else.
//
// APPEND-ONLY. A send is recorded once, sent or failed, and never edited or
// removed - the row is the paper trail (migration 090's design). NO update(),
// NO remove(): nothing in this codebase changes what was actually sent.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { media } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type EmailRow = media.EmailsRow;

export type NewEmail = {
  kind: EmailRow["kind"];
  status: EmailRow["status"];
  to_address: string;
  subject: string | null;
  order_id: string | null;
  user_id?: string | null;
  pdf_id?: string | null;
  provider_message_id?: string | null;
  error?: string | null;
};

export async function create(row: NewEmail, executor?: Executor): Promise<{ id: string }> {
  const { rows } = await query<{ id: string }>(
    sql("create"),
    [
      row.kind, row.status, row.to_address, row.subject, row.order_id,
      row.user_id, row.pdf_id, row.provider_message_id, row.error,
    ],
    executor
  );
  return rows[0];
}
