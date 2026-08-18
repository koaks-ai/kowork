// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUILTIN_INSPECTOR_CARDS,
  inspectorCardRegistry
} from '../../src/renderer/src/features/inspector/builtins'
import {
  createInspectorCardRegistry,
  useInspectorCards
} from '../../src/renderer/src/features/inspector/registry'
import type {
  InspectorCardDefinition,
  InspectorCardProps
} from '../../src/renderer/src/features/inspector/types'

afterEach(cleanup)

function TestCard({ context }: InspectorCardProps): React.JSX.Element {
  return createElement('div', null, context.session.modelName)
}

function definition(id: string, order: number): InspectorCardDefinition {
  return { id, order, source: { kind: 'builtin' }, component: TestCard }
}

describe('Inspector card registry', () => {
  it('registers built-in cards in stable order', () => {
    expect(BUILTIN_INSPECTOR_CARDS.map((card) => card.id)).toEqual([
      'builtin.status',
      'builtin.context-window',
      'builtin.session-metrics'
    ])
    expect(inspectorCardRegistry.getSnapshot().map((card) => card.id)).toEqual([
      'builtin.status',
      'builtin.context-window',
      'builtin.session-metrics'
    ])
  })

  it('sorts by order then id and publishes register/dispose snapshots', () => {
    const registry = createInspectorCardRegistry([definition('builtin.z', 200)])
    const listener = vi.fn()
    const unsubscribe = registry.subscribe(listener)
    const disposeB = registry.register(definition('builtin.b', 100))
    const disposeA = registry.register(definition('builtin.a', 100))

    expect(registry.getSnapshot().map((card) => card.id)).toEqual([
      'builtin.a',
      'builtin.b',
      'builtin.z'
    ])
    expect(listener).toHaveBeenCalledTimes(2)

    disposeA()
    disposeA()
    expect(registry.getSnapshot().map((card) => card.id)).toEqual(['builtin.b', 'builtin.z'])
    expect(listener).toHaveBeenCalledTimes(3)
    disposeB()
    unsubscribe()
  })

  it('rejects duplicate card ids', () => {
    const registry = createInspectorCardRegistry([definition('builtin.status', 100)])
    expect(() => registry.register(definition('builtin.status', 200))).toThrow(
      'Inspector card already registered: builtin.status'
    )
  })

  it('makes a dynamically registered plugin card visible to subscribers', async () => {
    const registry = createInspectorCardRegistry()
    function RegistryView(): React.JSX.Element {
      const cards = useInspectorCards(registry)
      return createElement(
        'div',
        null,
        cards.map((card) => createElement('span', { key: card.id }, card.id))
      )
    }
    const view = render(createElement(RegistryView))
    expect(view.queryByText('plugin.example.status')).toBeNull()

    const dispose = registry.register({
      id: 'plugin.example.status',
      order: 150,
      source: { kind: 'plugin', pluginId: 'example' },
      component: TestCard
    })
    await waitFor(() => expect(view.getByText('plugin.example.status')).not.toBeNull())

    dispose()
    await waitFor(() => expect(view.queryByText('plugin.example.status')).toBeNull())
  })
})
