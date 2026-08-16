import { describe, expect, it } from 'vitest'
import {
  createFallbackThreadTitle,
  isUntitledThreadTitle,
  normalizeGeneratedThreadTitle
} from '../../packages/core/src/domain/thread-title'

describe('thread titles', () => {
  it('derives a compact fallback from the first message', () => {
    expect(createFallbackThreadTitle('  修复登录页面的布局问题  ')).toBe('修复登录页面的布局…')
    expect(createFallbackThreadTitle('a'.repeat(60))).toBe(`${'a'.repeat(9)}…`)
  })

  it('cleans generated titles and falls back when the model returns nothing', () => {
    expect(normalizeGeneratedThreadTitle('  "修复登录流程"。 ', 'unused')).toBe('修复登录流程')
    expect(normalizeGeneratedThreadTitle('   ', '检查项目架构')).toBe('检查项目架构')
    expect(normalizeGeneratedThreadTitle('分析项目中的依赖更新策略', 'unused')).toBe(
      '分析项目中的依赖更…'
    )
  })

  it('recognizes both new and legacy untitled sessions', () => {
    expect(isUntitledThreadTitle('')).toBe(true)
    expect(isUntitledThreadTitle('新的会话')).toBe(true)
    expect(isUntitledThreadTitle('我的会话')).toBe(false)
  })
})
