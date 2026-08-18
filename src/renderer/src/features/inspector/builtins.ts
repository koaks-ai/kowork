import { ContextWindowCard } from './cards/ContextWindowCard'
import { SessionMetricsCard } from './cards/SessionMetricsCard'
import { StatusInformationCard } from './cards/StatusInformationCard'
import { createInspectorCardRegistry } from './registry'
import type { InspectorCardDefinition } from './types'

export const BUILTIN_INSPECTOR_CARDS: readonly InspectorCardDefinition[] = [
  { id: 'builtin.status', order: 100, source: { kind: 'builtin' }, component: StatusInformationCard },
  { id: 'builtin.context-window', order: 200, source: { kind: 'builtin' }, component: ContextWindowCard },
  { id: 'builtin.session-metrics', order: 300, source: { kind: 'builtin' }, component: SessionMetricsCard }
]

export const inspectorCardRegistry = createInspectorCardRegistry()

export function registerBuiltinInspectorCards(): () => void {
  const disposers = BUILTIN_INSPECTOR_CARDS.map((definition) =>
    inspectorCardRegistry.register(definition)
  )
  let active = true
  return () => {
    if (!active) return
    active = false
    for (const dispose of disposers) dispose()
  }
}

export const disposeBuiltinInspectorCards = registerBuiltinInspectorCards()
