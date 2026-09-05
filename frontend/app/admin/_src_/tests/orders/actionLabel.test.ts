// The button's WORDS. Which statuses are offered is the server's answer
// (OrderView.actions.statuses); this only names the move, and the direction
// of travel is what it has to get right - "Back to Received" and "Move to
// Received" are the same call and the opposite reassurance.
import { describe, expect, test } from 'vitest'
import { actionLabel } from '../../orders/actionLabel'

describe("the status button's label", () => {
  test('forward moves read as Move to, backward ones as Back to', () => {
    expect(actionLabel('purchase', 'In Transit', 'Received')).toBe('Move to Received')
    expect(actionLabel('purchase', 'Received', 'In Transit')).toBe('Back to In Transit')
    expect(actionLabel('purchase', 'Payment Processing', 'Completed')).toBe('Move to Completed')
    expect(actionLabel('purchase', 'Completed', 'Payment Processing')).toBe(
      'Back to Payment Processing'
    )
  })

  // THE LADDERS DISAGREE ABOUT "In Transit": a purchase starts there and a
  // sale ends there, which one combined list got backwards.
  test('the sale ladder reads the same way', () => {
    expect(actionLabel('sale', 'Pending', 'Preparing')).toBe('Move to Preparing')
    expect(actionLabel('sale', 'Preparing', 'Pending')).toBe('Back to Pending')
    expect(actionLabel('sale', 'Preparing', 'In Transit')).toBe('Move to In Transit')
  })

  // Cancelled is off the ladder in both directions, so neither word fits.
  test('cancelling and reopening are named for what they are', () => {
    expect(actionLabel('purchase', 'Received', 'Cancelled')).toBe('Cancel Order')
    expect(actionLabel('purchase', 'Cancelled', 'Received')).toBe('Reopen Order')
  })

  test('an unknown status still names its destination', () => {
    expect(actionLabel(null, null, 'Received')).toBe('Move to Received')
  })
})
