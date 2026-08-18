import { describe, expect, it } from 'vitest'
import { formatTokenCount } from '../../src/renderer/src/features/inspector/format'

describe('formatTokenCount', () => {
  it.each([
    [999, '999'],
    [1_000, '1K'],
    [2_400, '2.40K'],
    [1_000_000, '1M'],
    [1_250_000, '1.25M'],
    [1_000_000_000, '1B']
  ])('formats %i tokens as %s', (tokens, expected) => {
    expect(formatTokenCount(tokens)).toBe(expected)
  })
})
