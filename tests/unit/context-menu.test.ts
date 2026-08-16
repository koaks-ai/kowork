// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContextMenu } from '../../src/renderer/src/shared/ui/ContextMenu'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ContextMenu', () => {
  it('reveals with BlurReveal and plays the exit animation before closing', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const onSelect = vi.fn()
    render(
      createElement(ContextMenu, {
        x: 12,
        y: 24,
        onClose,
        items: [{ id: 'rename', label: '修改名称', onSelect }]
      })
    )

    const reveal = document.querySelector('[data-blur-reveal]')
    expect(reveal?.className).toContain('kowork-blur-reveal')
    expect(reveal?.className).toContain('h-full')
    expect(reveal?.getAttribute('data-state')).toBe('open')

    fireEvent.pointerDown(document.body)
    expect(reveal?.getAttribute('data-state')).toBe('closed')
    expect(onClose).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(219))
    expect(onClose).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
