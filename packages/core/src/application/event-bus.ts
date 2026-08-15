import type { RunEventDto, RunEventType } from '@kowork/contracts'
import type { AppDatabase } from '../infrastructure/db/database'

export type EventListener = (event: RunEventDto) => void

export class CoreEventBus {
  private readonly listeners = new Set<EventListener>()

  constructor(private readonly database: AppDatabase) {}

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(input: {
    projectId?: string | null
    threadId?: string | null
    runId?: string | null
    type: RunEventType
    payload?: Record<string, unknown>
  }): RunEventDto {
    const event = this.database.addEvent(input)
    for (const listener of this.listeners) listener(event)
    return event
  }
}
