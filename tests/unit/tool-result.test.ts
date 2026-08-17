import { describe, expect, it } from 'vitest'
import { limitToolOutput } from '../../packages/core/src/tools/tool-result'

describe('tool result limits', () => {
  it('preserves small structured results and truncates large results with metadata', () => {
    const small = { ok: true, value: 'text' }
    expect(limitToolOutput(small)).toBe(small)

    const source = `${'a'.repeat(40_000)}${'z'.repeat(40_000)}`
    const limited = limitToolOutput(source) as {
      truncated: boolean
      originalChars: number
      output: string
    }
    expect(limited.truncated).toBe(true)
    expect(limited.originalChars).toBe(80_000)
    expect(limited.output).toContain('[... output truncated ...]')
    expect(limited.output.startsWith('a'.repeat(1_000))).toBe(true)
    expect(limited.output.endsWith('z'.repeat(1_000))).toBe(true)
    expect(JSON.stringify(limited).length).toBeLessThanOrEqual(64_000)

    const escaped = limitToolOutput({ text: '"\n'.repeat(40_000) })
    expect(JSON.stringify(escaped).length).toBeLessThanOrEqual(64_000)
  })
})
