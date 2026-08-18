// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContextMenu } from '@kowork/design-system'

afterEach(() => {
  cleanup()
})

describe('ContextMenu', () => {
  it('opens with Radix context-menu semantics and selects an item', async () => {
    const onSelect = vi.fn()
    render(
      createElement(
        ContextMenu,
        null,
        createElement(
          ContextMenu.Trigger,
          { asChild: true },
          createElement('div', { 'data-trigger': true }, 'row')
        ),
        createElement(
          ContextMenu.Portal,
          null,
          createElement(
            ContextMenu.Content,
            null,
            createElement(ContextMenu.Item, { onSelect }, '修改名称')
          )
        )
      )
    )

    const trigger = document.querySelector('[data-trigger]')!
    fireEvent.contextMenu(trigger)
    const reveal = document.querySelector('[data-reveal]')
    expect(reveal).not.toBeNull()

    fireEvent.click(document.querySelector('[role="menuitem"]')!)
    await waitFor(() => expect(onSelect).toHaveBeenCalledOnce())
  })
})
