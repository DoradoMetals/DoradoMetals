import { expect, type Page, type Response } from '@playwright/test'
import type { LeadView } from '@dorado/contracts'

export const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(
  /\/$/,
  ''
)

export type Width = 'desktop' | 'mobile'

export const SIZES: { name: Width; width: number; height: number }[] = [
  { name: 'desktop', width: 1440, height: 1295 },
  { name: 'mobile', width: 390, height: 844 },
]

export async function api<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

export async function createLead(page: Page, label: string): Promise<LeadView> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const { status, body } = await api<LeadView>(page, 'POST', '/leads', {
    name: `E2E ${label} ${stamp}`,
    phone: `+1555${stamp.slice(-7)}`,
    email: `e2e-lead-${stamp}@example.invalid`,
  })
  expect(status, 'POST /leads').toBe(201)
  return body
}

export async function archiveLead(page: Page, id: string): Promise<void> {
  const { body } = await api<LeadView>(page, 'GET', `/leads/${id}`)
  if (body && !body.archived_at) await api(page, 'DELETE', `/leads/${id}`)
}

export const isResponse =
  (method: string, path: RegExp) =>
  (response: Response): boolean =>
    response.request().method() === method && path.test(new URL(response.url()).pathname)

export async function openLead(page: Page, id: string, name: string): Promise<void> {
  await page.goto(`/admin/leads/${id}`)
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({ timeout: 45_000 })
}

export const card = (page: Page, name: string) => page.getByTestId(`lead-card-${name}`)
