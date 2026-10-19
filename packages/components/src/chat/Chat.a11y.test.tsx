import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Chat } from './Chat'
import { expectNoAxeViolations } from '../test/axe'

describe('Chat accessibility', () => {
  it('the message thread is a log, so new messages are announced politely', async () => {
    const { getByRole, container } = render(
      <Chat
        phone="(555) 123-4567"
        messages={[{ id: '1', direction: 'inbound', time: '9:00', body: 'Hello' }]}
      />
    )
    const log = getByRole('log', { name: 'Customer messages' })
    expect(log.textContent).toContain('Hello')
    await expectNoAxeViolations(container)
  })
})
