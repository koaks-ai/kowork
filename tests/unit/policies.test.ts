import { describe, expect, it } from 'vitest'
import { requiresShellApproval, selectRecentTurnCount, shouldCompress } from '@kowork/core'

describe('permission policy', () => {
  it('implements the conservative Ask, Auto and Yolo shell modes', () => {
    expect(requiresShellApproval('ask', 'git status')).toBe(true)
    expect(requiresShellApproval('auto', 'git status')).toBe(false)
    expect(requiresShellApproval('auto', 'pnpm install')).toBe(true)
    expect(requiresShellApproval('yolo', 'rm -rf build')).toBe(false)
  })
})

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
