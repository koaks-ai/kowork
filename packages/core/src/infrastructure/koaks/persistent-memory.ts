import type { ConversationTurn, MemoryView, ModelItem, ThreadMemory } from '@koaks/node'
import type { AppDatabase } from '../db/database'

export class PersistentThreadMemory implements ThreadMemory {
  readonly retention = 'interrupted_if_side_effects' as const

  constructor(
    private readonly threadId: string,
    private readonly database: AppDatabase
  ) {}

  load(): MemoryView {
    const checkpoint = this.database.latestCompression(this.threadId)
    const turns = this.database.getConversationTurns(this.threadId)
    const visibleTurns = checkpoint
      ? turns.filter((turn) => turn.ordinal > checkpoint.coveredThroughOrdinal)
      : turns
    const transcript: ModelItem[] = []
    if (checkpoint) {
      transcript.push({
        type: 'message',
        role: 'system',
        content: [{ type: 'text', text: `Conversation summary:\n${checkpoint.summary}` }]
      })
    }
    for (const turn of visibleTurns) {
      transcript.push(...(JSON.parse(turn.itemsJson) as ModelItem[]))
    }
    if (checkpoint) return { transcript }
    const latestCheckpoint = [...visibleTurns]
      .reverse()
      .find((turn) => turn.checkpointJson)?.checkpointJson
    return {
      transcript,
      ...(latestCheckpoint ? { checkpoint: JSON.parse(latestCheckpoint) } : {})
    }
  }

  commit(turn: ConversationTurn): void {
    this.database.commitConversationTurn({
      threadId: this.threadId,
      statusJson: JSON.stringify(turn.status),
      itemsJson: JSON.stringify(turn.items),
      checkpointJson: turn.checkpoint ? JSON.stringify(turn.checkpoint) : null,
      usageJson: JSON.stringify(turn.usage)
    })
  }
}
