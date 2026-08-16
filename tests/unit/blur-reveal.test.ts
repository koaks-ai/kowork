// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { createElement, useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { BlurReveal } from '../../src/renderer/src/shared/ui/BlurReveal'

afterEach(() => {
  cleanup()
})

describe('BlurReveal', () => {
  it('wraps children with the blur reveal class', () => {
    const view = render(createElement(BlurReveal, { className: 'h-full' }, 'pane'))
    const root = view.container.querySelector('[data-blur-reveal]')
    expect(root?.className).toContain('kowork-blur-reveal')
    expect(root?.className).toContain('h-full')
    expect(root?.textContent).toBe('pane')
  })

  it('remounts children when contentKey changes', () => {
    let mounts = 0
    function Child(): React.JSX.Element {
      useEffect(() => {
        mounts += 1
      }, [])
      return createElement('span', null, 'pane')
    }

    const view = render(createElement(BlurReveal, { contentKey: 'a' }, createElement(Child)))
    expect(mounts).toBe(1)

    view.rerender(createElement(BlurReveal, { contentKey: 'b' }, createElement(Child)))
    expect(mounts).toBe(2)
  })

  it('defaults to the open state', () => {
    const view = render(createElement(BlurReveal, null, 'pane'))
    const root = view.container.querySelector('[data-blur-reveal]')
    expect(root?.getAttribute('data-state')).toBe('open')
  })

  it('reflects the closed state for exit animations', () => {
    const view = render(createElement(BlurReveal, { state: 'closed' }, 'pane'))
    const root = view.container.querySelector('[data-blur-reveal]')
    expect(root?.getAttribute('data-state')).toBe('closed')
  })
})
