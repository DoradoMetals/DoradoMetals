# Payments file comments log (GPSOCeWTjc7pDsQBs4gFt4)

## 2026-10-16 (single all-files worker)
- Jacob (People thread 1968939422, comments 1970241921 / 1970242162) opened page Accounts 57:480 for a bank-link component, "maybe it should be specific". Built set "Bank Link" 59:1169 at 0,0: Purpose=Payout|Payment (copy only) x State=Idle (intro, Primary "Link bank account", Library Accordion "Enter details manually" closed, sample body hidden) | Linking (Spinner + waiting line, button Disabled "Linking…") | Linked (bordered row bank name + last four + Success badge Linked, checked default Checkbox, Tertiary "Link a different account") | Failed (Danger Alert, Primary "Try again", manual fallback). Variants 59:1031, 59:1045, 59:1057, 59:1079 (Payout), 59:1105, 59:1117, 59:1128, 59:1147 (Payment). Library parts only.
- Open: cross-file use needs this file published as a library (or the set moved into Themes and Components). Payout accounts card stays on the People Customer screen (my recommendation in the thread); its drawer should instance this set once it can.
- High-water: tools/payments does not exist yet; orchestrator to add the file to the loop.
