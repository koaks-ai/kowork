// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SwapText } from '@kowork/design-system'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SwapText', () => {
  it('blurs the old value out before revealing the new value', async () => {
    vi.useFakeTimers()
    const view = render(createElement(SwapText, { value: '未命名会话' }))
    view.rerender(createElement(SwapText, { value: '修复登录流程' }))

    const text = view.container.querySelector('.kw-swap-text-value')!
    await act(() => vi.runOnlyPendingTimersAsync())
    expect(text.getAttribute('data-phase')).toBe('out')
    expect(text.textContent).toBe('未命名会话')

    await act(() => {
      fireEvent(text, new Event('animationend', { bubbles: true }))
    })
    expect(text.getAttribute('data-phase')).toBe('in')
    expect(text.textContent).toBe('修复登录流程')

    await act(() => {
      fireEvent(text, new Event('animationend', { bubbles: true }))
    })
    expect(text.getAttribute('data-phase')).toBe('idle')
  })

  it('uses the latest value when updates arrive during the exit animation', async () => {
    vi.useFakeTimers()
    const view = render(createElement(SwapText, { value: 'old' }))
    view.rerender(createElement(SwapText, { value: 'first' }))
    const text = view.container.querySelector('.kw-swap-text-value')!
    await act(() => vi.runOnlyPendingTimersAsync())
    expect(text.getAttribute('data-phase')).toBe('out')

    view.rerender(createElement(SwapText, { value: 'latest' }))
    await act(() => {
      fireEvent(text, new Event('animationend', { bubbles: true }))
    })
    expect(text.textContent).toBe('latest')
    expect(text.getAttribute('data-phase')).toBe('in')
  })
})
