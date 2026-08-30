// The one place an error reporter would attach, and today it is a console line.
//
// *** WHY THIS EXISTS. *** The API has NO error reporting - no sentry, bugsnag,
// rollbar, datadog, otel, pino or winston in api/package.json. Every error ends
// at Railway's stdout and is seen only by someone already looking. That is fine
// for a 500 with a stack trace, which the errorHandler prints loudly. It is not
// fine for the handful of paths that CATCH, log, and deliberately carry on,
// because those are the ones nobody is looking at:
//
//   an orphaned FedEx label the business is paying for
//   an orphaned carrier pickup with no order behind it
//   an order PDF that was never persisted
//   a sent email with no record that it was sent
//   any cron job failing, including updateSpotPrices, which every
//     customer-visible price depends on
//
// None of those is a bug. Failing an order because its PDF did not save would
// be worse. The defect is that nobody is told, and the fix is not to make them
// throw - it is to make them reportable.
//
// *** WHAT THIS IS NOT. *** It is not a logger, and adding Sentry to this
// process is deliberately NOT done here: that is a new dependency and a runtime
// agent inside the process that handles money, which is Jacob's call and not an
// agent's. What this is, is the seam - so that decision becomes one file rather
// than a hunt through five features. See FOLLOWUPS D191.
//
// *** IT MUST NEVER THROW. *** A reporter that fails takes down the path it was
// meant to observe, which is strictly worse than the silence it replaces. Every
// call is wrapped.
//
// *** IT MUST NEVER CARRY A BANK NUMBER. *** CLAUDE.md's oldest standing
// constraint. `extra` is redacted by key name before it goes anywhere, because
// the day a reporter IS attached, whatever is in `extra` leaves the building.

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
