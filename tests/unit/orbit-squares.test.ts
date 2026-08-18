// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { OrbitSquares } from '@kowork/design-system'

afterEach(() => {
  cleanup()
})

describe('OrbitSquares', () => {
  it('renders eight clockwise cells around a filled center', () => {
    const view = render(createElement(OrbitSquares))
    const root = view.container.querySelector('[data-orbit-squares]') as HTMLElement
    const cells = [...root.children] as HTMLElement[]

    expect(root.className).toContain('kw-orbit-squares')
    expect(cells).toHaveLength(9)
    expect(
      cells.slice(0, 8).map((cell) => [
        cell.style.gridColumn,
        cell.style.gridRow,
        cell.style.getPropertyValue('--i')
      ])
    ).toEqual([
      ['1', '1', '0'],
      ['2', '1', '1'],
      ['3', '1', '2'],
      ['3', '2', '3'],
      ['3', '3', '4'],
      ['2', '3', '5'],
      ['1', '3', '6'],
      ['1', '2', '7']
    ])
    expect(cells[8]?.className).toContain('kw-orbit-center')
  })
})
