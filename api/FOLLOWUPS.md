
8. FULL REWRITE (Jacob, the general rule of thumb): "I no longer care
   about ANY of the legacy code. I only care about the legacy table,
   which we have in place." The exchange TABLES and their data stay
   sacred - dual-writes continue so exchange stays a level shadow - but
   legacy READ paths, repo switches, and bothWays machinery are no longer
   a rollback story to preserve: the new code is the code. Legacy code
   survives only where it earns its keep as TEST infrastructure ("we can
   have some of our tests and logic be driven by legacy code, that's ok
   and appropriate"). CONSEQUENCE: the PO read pivot unblocks - the
   damaged-shipments divergence showed exchange as the damaged copy, and
   under full-rewrite the new schema's reads are the truth; the
   decomposition gate demotes from blocker to legacy-driven regression
   harness.
