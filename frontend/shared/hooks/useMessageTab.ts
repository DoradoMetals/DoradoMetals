'use client'

import { accountMessageUrl, accountMessages, useAuthFakes } from '@dorado/client'
import type { AccountMessage, OtpChannel } from '@dorado/contracts'

const RETRY_MS = 500

const WAITING_PAGE =
  '<!doctype html><meta charset="utf-8"><title>Message</title>' +
  '<body style="margin:0;display:grid;place-items:center;height:100vh;' +
  'font:15px system-ui,sans-serif;color:#555">Waiting for the message…'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const knownIds = async (): Promise<string[]> =>
  (await accountMessages().catch((): AccountMessage[] => [])).map((m) => m.message_id)

async function newMessageId(before: string[], channel?: OtpChannel): Promise<string | null> {
  const mine = (list: AccountMessage[]) =>
    channel ? list.filter((message) => message.channel === channel) : list
  const fresh = (list: AccountMessage[]) =>
    list.find((message) => !before.includes(message.message_id))?.message_id ?? null
  const first = mine(await accountMessages().catch((): AccountMessage[] => []))
  const found = fresh(first)
  if (found) return found
  await wait(RETRY_MS)
  const second = mine(await accountMessages().catch((): AccountMessage[] => []))
  return fresh(second) ?? second[0]?.message_id ?? null
}

export function openMessageIn(tab: Window, message_id: string | null) {
  if (message_id) tab.location.href = accountMessageUrl(message_id)
  else tab.close()
}

export function reserveTab(): Window | null {
  const tab = window.open('', '_blank')
  if (!tab) return null
  tab.document.write(WAITING_PAGE)
  tab.document.close()
  return tab
}

export function useMessageTab() {
  const fakes = useAuthFakes()
  const active = Boolean(fakes.data?.sms || fakes.data?.email)

  const run = async <T>(send: () => Promise<T>, channel?: OtpChannel): Promise<T> => {
    const recorded = channel ? Boolean(fakes.data?.[channel]) : active
    if (!recorded) return send()
    const tab = reserveTab()
    const before = tab ? await knownIds() : []
    const result = await send().catch((err: unknown) => {
      tab?.close()
      throw err
    })
    if (tab) void newMessageId(before, channel).then((id) => openMessageIn(tab, id))
    return result
  }

  return { active, run }
}
