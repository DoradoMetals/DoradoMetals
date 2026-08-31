// The accessibility gate every component test runs through. axe-core against
// the rendered container, violations returned as readable strings so the
// assertion failure names the rule and the offending node - not "expected 1
// to be 0".
//
// color-contrast is disabled: it needs a real layout engine (canvas) and
// jsdom has none, so axe would silently skip it anyway while occasionally
// throwing. Contrast is pinned the honest way, by state-contrast.test.ts
// against the theme tokens themselves.
import axe from "axe-core";

export async function axeViolations(node: Element): Promise<string[]> {
  const results = await axe.run(node, {
    rules: {
      "color-contrast": { enabled: false },
      // Landmark containment is PAGE composition - a component test renders
      // no <main>, so this fires on every portal. The app's pages own it.
      region: { enabled: false },
    },
  });
  return results.violations.map(
    (v) =>
      `${v.id}: ${v.help} [${v.nodes
        .map((n) => n.target.join(" "))
        .join("; ")}]`,
  );
}
