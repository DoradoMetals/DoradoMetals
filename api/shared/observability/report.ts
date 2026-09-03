// The one seam an error reporter would attach to — today it's a console line. Exists because the API has NO error reporting at all, so paths that CATCH, log, and deliberately carry on (an orphaned FedEx label, a lost order PDF, an unsent-but-unrecorded email, a failed spot-price cron) are seen by nobody. The fix isn't making them throw — an order shouldn't fail because its PDF didn't save — it's making them reportable.
// NOT a logger, and adding Sentry here is deliberately NOT done — a new dependency and runtime agent inside the money-handling process is Jacob's call, not an agent's; this file is the seam so that decision is one file, not a hunt through five features (FOLLOWUPS D191).
// MUST NEVER THROW — a reporter that fails takes down the path it was meant to observe. Every call is wrapped.
// MUST NEVER CARRY A BANK NUMBER — `extra` is redacted by key name before going anywhere, because the day a reporter is attached, whatever's in `extra` leaves the building.

// Keys whose values never leave this process. Matched case-insensitively on the
// whole key, and on the common suffixes, so `routing_number`, `routingNumber`
// and `payout.account_number` are all caught.
const SECRET_KEY = /(^|[._-])(routing|account)_?number$|^(ssn|tax_?id|iban|swift|password|token|secret|api_?key|authorization|cookie)$/i;

function redact(extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    out[k] = SECRET_KEY.test(k) ? "[REDACTED]" : v;
  }
  return out;
}

export type ErrorReport = {
  /** Where this happened, as a stable identifier - `orders.cancelLabel`. */
  at: string;
  /** What was lost or left inconsistent, in one line, for a human on call. */
  message: string;
  err?: unknown;
  extra?: Record<string, unknown>;
};

/**
 * Report something that went wrong on a path that is deliberately continuing.
 *
 * Not for errors that reach the client - those go through the errorHandler,
 * which already prints them in full. This is for the catch blocks that swallow
 * on purpose.
 */
export function reportError({ at, message, err, extra }: ErrorReport): void {
  try {
    const detail = err instanceof Error ? err.message : err != null ? String(err) : undefined;
    const context = extra && Object.keys(extra).length
      ? ` ${JSON.stringify(redact(extra))}`
      : "";
    console.error(
      `[${at}] ${message}${detail ? ` - ${detail}` : ""}${context}`
    );
    if (err instanceof Error && err.stack) console.error(err.stack);

    // ATTACH A REPORTER HERE. One call, e.g.
    //   Sentry.captureException(err ?? new Error(message), {
    //     tags: { at }, extra: redact(extra ?? {}) });
    // and every site below starts paging instead of scrolling past.
  } catch {
    // A reporter must never fail the path it observes.
  }
}
