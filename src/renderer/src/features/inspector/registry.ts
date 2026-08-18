import { useSyncExternalStore } from 'react'
import type { InspectorCardDefinition } from './types'

export interface InspectorCardRegistry {
  register(definition: InspectorCardDefinition): () => void
  getSnapshot(): readonly InspectorCardDefinition[]
  subscribe(listener: () => void): () => void
}

export function createInspectorCardRegistry(
  initialCards: readonly InspectorCardDefinition[] = []
): InspectorCardRegistry {
  const cards = new Map(initialCards.map((card) => [card.id, card]))
  const listeners = new Set<() => void>()
  let snapshot = sortCards(cards.values())

  const publish = (): void => {
    snapshot = sortCards(cards.values())
    listeners.forEach((listener) => listener())
  }

  return {
    register(definition) {
      if (cards.has(definition.id)) throw new Error(`Inspector card already registered: ${definition.id}`)
      cards.set(definition.id, definition)
      publish()
      let active = true
      return () => {
        if (!active) return
        active = false
        cards.delete(definition.id)
        publish()
      }
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

function sortCards(cards: Iterable<InspectorCardDefinition>): readonly InspectorCardDefinition[] {
  return [...cards].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

export function useInspectorCards(registry: InspectorCardRegistry): readonly InspectorCardDefinition[] {
  return useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot)
}
