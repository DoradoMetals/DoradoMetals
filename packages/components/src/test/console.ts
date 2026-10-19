import { cleanup } from '@testing-library/react'
import { vi, type MockInstance } from 'vitest'

const noise: string[] = []
const spies: MockInstance[] = []

export function watchConsole(): void {
  noise.length = 0
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console)
    spies.push(
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        noise.push(`console.${level}: ${args.map(String).join(' ')}`)
        original(...args)
      })
    )
  }
}

export function takeConsoleNoise(): string[] {
  return noise.splice(0)
}

export function failOnConsoleNoise(): void {
  cleanup()
  for (const spy of spies.splice(0)) spy.mockRestore()
  const heard = takeConsoleNoise()
  if (heard.length > 0) throw new Error(`console output during test:\n${heard.join('\n')}`)
}
