import { describe, expect, it, vi } from 'vitest'

import { Attachment } from '../attachment/Attachment'
import { Avatar } from '../avatar/Avatar'
import { Progress } from '../progress/Progress'
import { RadioGroup, RadioOption } from '../radio/Radio'
import { Slider } from '../slider/Slider'
import { TimePicker } from '../date-picker/TimePicker'
import { setup } from './render'
import { expectNoAxeViolations } from './axe'

describe('Attachment states', () => {
  it.each(['uploading', 'complete', 'error'] as const)(
    '%s renders and axe finds nothing',
    async (state) => {
      const { container } = setup(
        <Attachment filename="assay.pdf" state={state} progress={40} onRemove={() => {}} />
      )
      expect(container.textContent).toContain('assay.pdf')
      await expectNoAxeViolations(container)
    }
  )

  it('uploading without progress starts at 0 and Remove fires from the keyboard', async () => {
    const onRemove = vi.fn()
    const { user, getByRole } = setup(
      <Attachment filename="a.pdf" state="uploading" onRemove={onRemove} />
    )
    expect(
      getByRole('progressbar', { name: 'Uploading a.pdf' }).getAttribute('aria-valuenow')
    ).toBe('0')
    getByRole('button', { name: 'Remove a.pdf' }).focus()
    await user.keyboard('{Enter}')
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})

describe('Avatar', () => {
  it('shows the fallback, or the children when no fallback is given', () => {
    const { getByText, rerender } = setup(<Avatar fallback="AJ" />)
    expect(getByText('AJ')).toBeTruthy()
    rerender(
      <Avatar src="data:," alt="Ana">
        ZZ
      </Avatar>
    )
    expect(getByText('ZZ')).toBeTruthy()
  })
})

describe('Progress', () => {
  it('clamps below 0 and above 100, and takes a labelledby in place of a label', () => {
    const { getAllByRole } = setup(
      <>
        <span id="lbl">Upload</span>
        <Progress value={-20} />
        <Progress value={250} aria-labelledby="lbl" />
      </>
    )
    const [low, high] = getAllByRole('progressbar')
    expect(low!.getAttribute('aria-valuenow')).toBe('0')
    expect(low!.getAttribute('aria-label')).toBe('Progress')
    expect(high!.getAttribute('aria-valuenow')).toBe('100')
    expect(high!.getAttribute('aria-label')).toBeNull()
  })
})

describe('RadioOption', () => {
  it('defaults to the card variant with its radio, and a chip hides it', async () => {
    const { container, getAllByRole } = setup(
      <RadioGroup aria-label="Ship" defaultValue="a">
        <RadioOption value="a">Pickup</RadioOption>
        <RadioOption value="b" variant="chip">
          Mail
        </RadioOption>
      </RadioGroup>
    )
    expect(getAllByRole('radio')).toHaveLength(2)
    await expectNoAxeViolations(container)
  })
})

describe('Slider', () => {
  it('reads the default value, falls back to min, and hides the value on request', () => {
    const first = setup(<Slider aria-label="Purity" defaultValue={[30]} />)
    expect(first.container.textContent).toBe('30%')
    first.unmount()
    const floor = setup(<Slider aria-label="Floor" min={10} max={20} />)
    expect(floor.getByRole('slider').getAttribute('aria-valuenow')).toBe('10')
    expect(floor.container.textContent).toBe('0%')
    floor.unmount()
    const quiet = setup(
      <Slider aria-label="Quiet" value={[15]} min={10} max={20} showValue={false} />
    )
    expect(quiet.container.textContent).toBe('')
  })
})

describe('TimePicker variants', () => {
  const groups = [
    {
      label: 'Morning',
      slots: [
        { value: '9', label: '9:00 AM' },
        { value: '10', label: '10:00 AM', available: false },
      ],
    },
    {
      label: 'Afternoon',
      slots: [
        { value: '13', label: '1:00 PM' },
        { value: '14', label: '2:00 PM' },
        { value: '15', label: '3:00 PM' },
      ],
    },
  ]

  it.each([
    [
      'bare with heading, three across',
      { bare: true, heading: 'Pick a time', columns: 3 as const },
    ],
    ['boxed with heading', { heading: 'Pick a time' }],
    ['no heading', {}],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container, getAllByRole } = setup(
      <TimePicker groups={groups} onValueChange={() => {}} {...props} />
    )
    expect(getAllByRole('group')).toHaveLength(2)
    await expectNoAxeViolations(container)
  })

  it('controlled: picking reports and the value prop wins', async () => {
    const onValueChange = vi.fn()
    const { user, getByRole } = setup(
      <TimePicker groups={groups} value="9" onValueChange={onValueChange} bare columns={3} />
    )
    await user.click(getByRole('radio', { name: '2:00 PM' }))
    expect(onValueChange).toHaveBeenCalledWith('14')
    expect(getByRole('radio', { name: '9:00 AM' }).getAttribute('aria-checked')).toBe('true')
  })
})
