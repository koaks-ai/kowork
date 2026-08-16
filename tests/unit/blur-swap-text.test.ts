// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlurSwapText } from '../../src/renderer/src/shared/ui/BlurSwapText'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('BlurSwapText', () => {
  it('blurs the old value out before revealing the new value', async () => {
    vi.useFakeTimers()
    const view = render(createElement(BlurSwapText, { value: '未命名会话' }))
    view.rerender(createElement(BlurSwapText, { value: '修复登录流程' }))

    const text = view.container.querySelector('.kowork-blur-swap-text')!
    await act(() => vi.advanceTimersByTimeAsync(20))
    expect(text.getAttribute('data-phase')).toBe('out')
    expect(text.textContent).toBe('未命名会话')

    await act(() => vi.advanceTimersByTimeAsync(120))
    expect(text.getAttribute('data-phase')).toBe('in')
    expect(text.textContent).toBe('修复登录流程')

    await act(() => vi.advanceTimersByTimeAsync(320))
    expect(text.getAttribute('data-phase')).toBe('idle')
  })

  it('uses the latest value when updates arrive during the exit animation', async () => {
    vi.useFakeTimers()
    const view = render(createElement(BlurSwapText, { value: 'old' }))
    view.rerender(createElement(BlurSwapText, { value: 'first' }))
    const text = view.container.querySelector('.kowork-blur-swap-text')!
    await act(() => vi.advanceTimersByTimeAsync(20))
    expect(text.getAttribute('data-phase')).toBe('out')

    view.rerender(createElement(BlurSwapText, { value: 'latest' }))
    await act(() => vi.advanceTimersByTimeAsync(120))
    expect(text.textContent).toBe('latest')
    expect(text.getAttribute('data-phase')).toBe('in')
  })
})
