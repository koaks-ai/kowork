import { describe, expect, it } from 'vitest'
import { selectRecentTurnCount, shouldCompress } from '@kowork/core'

describe('compression policy', () => {
  it('triggers at ninety percent and keeps at most eight recent turns', () => {
    expect(shouldCompress(89_999, 100_000)).toBe(false)
    expect(shouldCompress(90_000, 100_000)).toBe(true)
    expect(selectRecentTurnCount(Array(12).fill(2_000), 100_000)).toBe(8)
  })

  it('reduces recent turns when they would dominate the context', () => {
    expect(selectRecentTurnCount([30_000, 30_000, 30_000, 30_000], 100_000)).toBe(2)
  })
})
