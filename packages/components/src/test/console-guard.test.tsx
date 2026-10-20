import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { render } from '@testing-library/react'
import { failOnConsoleNoise, takeConsoleNoise, watchConsole } from './console'

function LoudOnUnmount() {
  React.useEffect(() => () => console.error('cleanup failed'), [])
  return <p>mounted</p>
}

function Keyless() {
  return (
    <ul>
      {['a', 'b'].map((x) => (
        <li>{x}</li>
      ))}
    </ul>
  )
}

describe('console guard', () => {
  it('hears a React warning that the after-each hook would fail on', () => {
    render(<Keyless />)
    const heard = takeConsoleNoise()
    expect(heard.some((line) => line.includes('unique "key"'))).toBe(true)
  })

  it('hears console.warn too', () => {
    console.warn('loud')
    expect(takeConsoleNoise()).toEqual(['console.warn: loud'])
  })

  it('stays silent on a quiet render', () => {
    render(<p>quiet</p>)
    expect(takeConsoleNoise()).toEqual([])
  })

  it('the after-each check throws with the captured lines', () => {
    console.error('boom')
    let message = ''
    try {
      failOnConsoleNoise()
    } catch (error) {
      message = (error as Error).message
    }
    watchConsole()
    expect(message).toBe('console output during test:\nconsole.error: boom')
  })

  it('unmounts before checking, so an error logged on unmount is caught', () => {
    render(<LoudOnUnmount />)
    let message = ''
    try {
      failOnConsoleNoise()
    } catch (error) {
      message = (error as Error).message
    }
    watchConsole()
    expect(message).toContain('cleanup failed')
  })
})
