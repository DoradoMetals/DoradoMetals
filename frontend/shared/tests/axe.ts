import axe from 'axe-core'
import { expect } from 'vitest'

async function axeViolations(node: Element): Promise<string[]> {
  const results = await axe.run(node, {
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: false },
    },
  })
  return results.violations.map(
    (v) => `${v.id}: ${v.help} [${v.nodes.map((n) => n.target.join(' ')).join('; ')}]`
  )
}

export async function expectNoAxeViolations(container: Element = document.body): Promise<void> {
  expect(await axeViolations(container)).toEqual([])
}
