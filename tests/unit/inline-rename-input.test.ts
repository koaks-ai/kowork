// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InlineRenameInput } from '../../src/renderer/src/shared/ui/InlineRenameInput'

afterEach(() => {
  cleanup()
})

describe('InlineRenameInput', () => {
  it('cancels when the submitted title is empty or unchanged', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const view = render(
      createElement(InlineRenameInput, {
        value: '旧标题',
        'aria-label': '会话标题',
        onSubmit,
        onCancel
      })
    )
    const input = view.getByRole('textbox', { name: '会话标题' }) as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('cancels on Escape without submitting', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const view = render(
      createElement(InlineRenameInput, {
        value: '旧标题',
        'aria-label': '会话标题',
        onSubmit,
        onCancel
      })
    )
    const input = view.getByRole('textbox', { name: '会话标题' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '新标题' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
