// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnimatedDisclosure } from '../../src/renderer/src/shared/ui/AnimatedDisclosure'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AnimatedDisclosure', () => {
  it('animates between measured open and closed heights', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(72)
    const view = render(
      createElement(AnimatedDisclosure, { open: false }, createElement('div', null, 'Content'))
    )
    const disclosure = view.container.querySelector('[data-animated-disclosure]') as HTMLElement

    expect(disclosure.dataset.state).toBe('closed')
    expect(disclosure.getAttribute('aria-hidden')).toBe('true')
    expect(disclosure.style.height).toBe('0px')

    view.rerender(
      createElement(AnimatedDisclosure, { open: true }, createElement('div', null, 'Content'))
    )

    await waitFor(() => expect(disclosure.classList).toContain('is-open'))
    expect(disclosure.dataset.state).toBe('open')
    expect(disclosure.getAttribute('aria-hidden')).toBe('false')
    expect(disclosure.style.height).toBe('72px')

    view.rerender(
      createElement(AnimatedDisclosure, { open: false }, createElement('div', null, 'Content'))
    )
    expect(disclosure.dataset.state).toBe('closed')
    expect(disclosure.style.height).toBe('0px')
  })
})
