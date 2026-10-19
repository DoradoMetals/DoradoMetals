import { describe, expect, it } from 'vitest'
import { classList, setup } from './render'
import { makeRows } from './rows'

describe('test helpers', () => {
  it('makeRows makes n rows with unique ids and a cycling metal', () => {
    const rows = makeRows(1000)
    expect(rows).toHaveLength(1000)
    expect(new Set(rows.map((row) => row.id)).size).toBe(1000)
    expect(rows.slice(0, 4).map((row) => row.metal)).toEqual(['Gold', 'Silver', 'Platinum', 'Gold'])
    expect(rows[0]!.item).toBe('Item 0001')
    expect(makeRows(0)).toEqual([])
  })

  it('setup renders and hands back a user-event instance', async () => {
    let clicks = 0
    const { user, getByRole } = setup(<button onClick={() => clicks++}>Go</button>)
    await user.click(getByRole('button'))
    expect(clicks).toBe(1)
  })

  it('classList sorts the classes and refuses a missing element', () => {
    const { container } = setup(<p className="b a" />)
    expect(classList(container.firstElementChild)).toEqual(['a', 'b'])
    expect(() => classList(null)).toThrow('no element')
  })
})
