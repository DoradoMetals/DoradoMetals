import fs from 'node:fs'
import path from 'node:path'
import { expect, type Locator, type Page, type Response } from '@playwright/test'
import type { Action, OrderView } from '@dorado/contracts'

import { ROLES } from '@/shared/tests/roles'

export const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(
  /\/$/,
  ''
)

export type Width = 'desktop' | 'mobile'

export const SIZES: { name: Width; width: number; height: number }[] = [
  { name: 'desktop', width: 1440, height: 1386 },
  { name: 'mobile', width: 390, height: 844 },
]

export type Fixtures = {
  purchase: string
  sale: string
  disposable_purchases: Record<Width, string>
  disposable_sales: Record<Width, string>
  addresses: string[]
}

export function fixtures(): Fixtures {
  const file = path.join(process.cwd(), 'playwright', '.fixtures', 'orders.json')
  if (!fs.existsSync(file)) {
    throw new Error(`${file} is missing - run \`pnpm seed\` to plant the order screen fixtures`)
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Fixtures
}

export async function api<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  url: string,
  data?: unknown
): Promise<{ status: number; body: T }> {
  const response = await page.request.fetch(`${API}${url}`, {
    method,
    ...(data !== undefined ? { data, headers: { 'Content-Type': 'application/json' } } : {}),
  })
  const text = await response.text()
  return { status: response.status(), body: (text ? JSON.parse(text) : null) as T }
}

export async function viewOf(page: Page, id: string): Promise<OrderView> {
  const { status, body } = await api<OrderView>(page, 'GET', `/orders/${id}`)
  expect(status, `GET /orders/${id}`).toBe(200)
  return body
}

export const actionOf = (view: OrderView, name: string): Action | undefined =>
  view.actions.find((action) => action.name === name)

export async function openOrder(page: Page, id: string): Promise<Locator> {
  await page.goto(`/admin/orders/${id}`)
  const screen = page.getByTestId('order-screen')
  await expect(screen).toHaveAttribute('data-direction', /^(purchase|sale)$/, { timeout: 45_000 })
  return screen
}

export async function cardNames(region: Locator): Promise<string[]> {
  return await region
    .locator('[data-testid^="order-card-"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node.getAttribute('data-testid') ?? '').replace('order-card-', ''))
    )
}

export const card = (page: Page, name: string): Locator => page.getByTestId(`order-card-${name}`)

export const sectionToggle = (scope: Locator, title: string): Locator =>
  scope.getByRole('button', { name: new RegExp(`^${title}`) }).first()

export async function openSection(scope: Locator, title: string): Promise<void> {
  const toggle = sectionToggle(scope, title)
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
}

export const dialog = (page: Page, title: string | RegExp): Locator =>
  page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: title }) })

export async function forceStepUp(page: Page): Promise<void> {
  await page.route(`${API}/account/session`, async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as Record<string, unknown>
    await route.fulfill({ response, json: { ...body, fresh: false } })
  })
}

type Sent = { channel: 'email' | 'sms'; destination: string }

export function awaitStepUpCode(page: Page): Promise<Response> {
  return page.waitForResponse(isResponse('POST', /\/account\/step_up$/))
}

export async function stepUpWith(page: Page, sent: Promise<Response>): Promise<void> {
  const response = await sent
  expect(response.status(), 'POST /account/step_up').toBe(200)
  await passStepUp(page, (await response.json()) as Sent)
}

export async function passStepUp(page: Page, sent: Sent): Promise<void> {
  const box = page.getByRole('dialog').filter({ hasText: 'Confirm it’s you' })
  await expect(box).toBeVisible()
  const query =
    sent.channel === 'email'
      ? `email=${encodeURIComponent(ROLES.admin.email)}`
      : `number=${encodeURIComponent(ROLES.admin.phone_number)}`
  const { body } = await api<{ code: string | null }>(page, 'GET', `/account/last_code?${query}`)
  expect(body.code, 'the step-up code was not recorded by the fake').toBeTruthy()
  await box.getByLabel('One-time code').fill(body.code as string)
  await box.getByRole('button', { name: 'Verify' }).click()
}

export async function noHorizontalScroll(page: Page, width: number): Promise<void> {
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scroll).toBeLessThanOrEqual(width)
}

export async function assertColumns(page: Page, width: Width): Promise<void> {
  const main = await page.getByTestId('order-main').boundingBox()
  const aside = await page.getByTestId('order-aside').boundingBox()
  expect(main && aside).toBeTruthy()
  if (!main || !aside) return
  if (width === 'desktop') {
    expect(aside.x).toBeGreaterThan(main.x + main.width - 1)
    expect(Math.round(aside.width)).toBe(400)
  } else {
    expect(aside.y).toBeGreaterThan(main.y + main.height - 1)
    await noHorizontalScroll(page, 390)
  }
}

export const isResponse =
  (method: string, pattern: RegExp) =>
  (response: { request: () => { method: () => string }; url: () => string }) =>
    response.request().method() === method && pattern.test(response.url())
