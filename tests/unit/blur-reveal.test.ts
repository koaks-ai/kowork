// @vitest-environment jsdom
/* eslint-disable react/no-children-prop -- React 19 requires required children in createElement props. */

import { cleanup, render } from '@testing-library/react'
import { createElement, useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Reveal } from '@kowork/design-system'

afterEach(() => {
  cleanup()
})

describe('Reveal', () => {
  it('wraps children with the blur reveal class', () => {
    const view = render(createElement(Reveal, { className: 'h-full', children: 'pane' }))
    const root = view.container.querySelector('[data-reveal]')
    expect(root?.className).toContain('kw-reveal')
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

    const view = render(
      createElement(Reveal, { contentKey: 'a', children: createElement(Child) })
    )
    expect(mounts).toBe(1)

    view.rerender(createElement(Reveal, { contentKey: 'b', children: createElement(Child) }))
    expect(mounts).toBe(2)
  })

  it('defaults to the open state', () => {
    const view = render(createElement(Reveal, { children: 'pane' }))
    const root = view.container.querySelector('[data-reveal]')
    expect(root?.getAttribute('data-state')).toBe('open')
  })

  it('reflects the closed state for exit animations', () => {
    const view = render(createElement(Reveal, { state: 'closed', children: 'pane' }))
    const root = view.container.querySelector('[data-reveal]')
    expect(root?.getAttribute('data-state')).toBe('closed')
  })
})
