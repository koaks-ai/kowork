// @vitest-environment jsdom
/* eslint-disable react/no-children-prop -- React 19 requires required children in createElement props. */

import * as Tooltip from '@radix-ui/react-tooltip'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createElement, useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Button,
  Disclosure,
  IconButton,
  PLUGIN_UI_KIT_API_VERSION,
  PluginUiKit,
  Reveal,
  SelectableItem,
  SelectableList,
  Slider,
  Surface
} from '@kowork/design-system'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    toJSON: () => ({})
  } as DOMRect
}

describe('design-system primitives', () => {
  it('completes Reveal exits from the CSS animation lifecycle', async () => {
    const onExitComplete = vi.fn()
    const view = render(
      createElement(Reveal, { state: 'closed', onExitComplete, children: 'content' })
    )
    const reveal = view.container.querySelector('[data-reveal]')!

    fireEvent(reveal, new Event('animationend', { bubbles: true }))
    await waitFor(() => expect(onExitComplete).toHaveBeenCalledOnce())

    fireEvent(reveal, new Event('animationend', { bubbles: true }))
    expect(onExitComplete).toHaveBeenCalledOnce()
  })

  it('completes Reveal exits immediately for reduced motion', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }))
    )
    const onExitComplete = vi.fn()
    render(createElement(Reveal, { state: 'closed', onExitComplete, children: 'content' }))
    await waitFor(() => expect(onExitComplete).toHaveBeenCalledOnce())
  })

  it('supports Reveal asChild and remounts content by contentKey', () => {
    let mounts = 0
    function Child(props: React.HTMLAttributes<HTMLButtonElement>): React.JSX.Element {
      useEffect(() => {
        mounts += 1
      }, [])
      return createElement('button', props, 'content')
    }
    const view = render(
      createElement(Reveal, {
        asChild: true,
        contentKey: 'one',
        children: createElement(Child)
      })
    )
    expect(view.getByRole('button').getAttribute('data-reveal')).not.toBeNull()
    view.rerender(
      createElement(Reveal, {
        asChild: true,
        contentKey: 'two',
        children: createElement(Child)
      })
    )
    expect(mounts).toBe(2)
  })

  it('connects Disclosure trigger, content, and chevron state', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(48)
    const onOpenChange = vi.fn()
    const view = render(
      createElement(
        Disclosure.Root,
        { open: false, onOpenChange },
        createElement(Disclosure.Trigger, null, 'toggle'),
        createElement(Disclosure.Chevron, { direction: 'right' }),
        createElement(Disclosure.Content, null, 'details')
      )
    )

    const trigger = view.getByRole('button', { name: 'toggle' })
    const content = view.container.querySelector('[data-disclosure]')!
    const chevron = view.container.querySelector('.kw-disclosure-chevron')!
    await waitFor(() => expect(trigger.getAttribute('aria-controls')).toBe(content.id))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(chevron.getAttribute('data-direction')).toBe('right')
    expect(chevron.getAttribute('data-state')).toBe('closed')

    fireEvent.click(trigger)
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('measures vertical and horizontal SelectableList geometry dynamically', async () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      return {
        borderRadius: element.getAttribute('data-geometry') === 'first' ? '8px' : ''
      } as CSSStyleDeclaration
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.hasAttribute('data-selectable-list')) return rect(10, 20, 240, 120)
      if (this.getAttribute('data-geometry') === 'first') return rect(18, 26, 90, 28)
      if (this.getAttribute('data-geometry') === 'second') return rect(112, 60, 120, 36)
      return rect(0, 0, 0, 0)
    })

    const list = (value: string, orientation: 'vertical' | 'horizontal'): React.ReactElement =>
      createElement(SelectableList, {
        value,
        orientation,
        children: [
          createElement(SelectableItem, {
            key: 'first',
            value: 'first',
            asChild: true,
            children: createElement('button', { 'data-geometry': 'first' }, 'first')
          }),
          createElement(SelectableItem, {
            key: 'second',
            value: 'second',
            asChild: true,
            children: createElement('button', { 'data-geometry': 'second' }, 'second')
          })
        ]
      })

    const view = render(list('first', 'vertical'))
    const highlight = view.container.querySelector('[data-selection-highlight]') as HTMLElement
    await waitFor(() => expect(highlight.style.width).toBe('90px'))
    await waitFor(() => expect(highlight.getAttribute('data-highlight-ready')).toBe('true'))
    expect(highlight.style.height).toBe('28px')
    expect(highlight.style.borderRadius).toBe('8px')
    expect(highlight.style.transform).toBe('translate3d(8px, 6px, 0)')

    view.rerender(list('second', 'horizontal'))
    await waitFor(() => expect(highlight.style.width).toBe('120px'))
    expect(highlight.style.height).toBe('36px')
    expect(highlight.style.transform).toBe('translate3d(102px, 40px, 0)')
    expect(
      view.container.querySelector('[data-selectable-list]')?.getAttribute('data-orientation')
    ).toBe('horizontal')
  })

  it('anchors the sliding highlight inside a bordered list', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.hasAttribute('data-selectable-list')) return rect(10, 20, 240, 40)
      if (this.getAttribute('data-geometry') === 'bordered') return rect(19, 25, 90, 28)
      return rect(0, 0, 0, 0)
    })

    const view = render(
      createElement(SelectableList, {
        value: 'selected',
        className: 'border',
        children: createElement(SelectableItem, {
          value: 'selected',
          asChild: true,
          children: createElement('button', { 'data-geometry': 'bordered' }, 'selected')
        })
      })
    )
    const root = view.container.querySelector('[data-selectable-list]') as HTMLElement
    Object.defineProperty(root, 'clientLeft', { configurable: true, value: 1 })
    Object.defineProperty(root, 'clientTop', { configurable: true, value: 1 })
    const highlight = view.container.querySelector('[data-selection-highlight]') as HTMLElement

    await waitFor(() => expect(highlight.style.transform).toBe('translate3d(8px, 4px, 0)'))
  })

  it('uses fill selection without rendering a second sliding highlight', () => {
    const view = render(
      createElement(SelectableList, {
        value: 'selected',
        selectionStyle: 'fill',
        children: createElement(SelectableItem, {
          value: 'selected',
          asChild: true,
          children: createElement('button', null, 'selected')
        })
      })
    )
    const item = view.getByRole('button')
    expect(view.container.querySelector('[data-selection-highlight]')).toBeNull()
    expect(item.getAttribute('data-selection-style')).toBe('fill')
    expect(item.getAttribute('data-selected')).toBe('true')
  })

  it('exposes token variants and a frozen versioned PluginUiKit', () => {
    const view = render(
      createElement(
        Tooltip.Provider,
        null,
        createElement(Surface, { variant: 'dialog', children: 'surface' }),
        createElement(Button, { variant: 'danger', children: 'delete' }),
        createElement(IconButton, { label: 'options' }, '…')
      )
    )
    expect(view.container.querySelector('[data-surface="dialog"]')?.className).toContain(
      'kw-surface-dialog'
    )
    expect(view.getByRole('button', { name: 'delete' }).className).toContain('kw-button-danger')
    expect(view.getByRole('button', { name: 'options' }).className).toContain('kw-icon-button')
    expect(PluginUiKit.apiVersion).toBe(PLUGIN_UI_KIT_API_VERSION)
    expect(Object.isFrozen(PluginUiKit)).toBe(true)
    expect(Object.hasOwn(PluginUiKit, 'Slider')).toBe(false)
  })

  it('reports numeric Slider values without entering PluginUiKit', () => {
    const onValueChange = vi.fn()
    const view = render(createElement(Slider, { min: 0, max: 64, value: 32, onValueChange }))
    const slider = view.getByRole('slider')
    fireEvent.change(slider, { target: { value: '48' } })
    expect(onValueChange).toHaveBeenCalledWith(48)
  })
})
