import type { ComponentType } from 'react'

export interface InspectorCardContext {
  projectId?: string
  threadId?: string
  status: {
    additions: number
    deletions: number
    branch: string
  }
  contextWindow: {
    usedTokens: number
    limitTokens: number
    percentage: number
  }
  session: {
    requestCount: number
    totalTokens: number
    modelName: string
    permissionMode: string
  }
  actions: {
    openChanges(): void
  }
}

export interface InspectorCardProps {
  context: InspectorCardContext
}

export type InspectorCardSource =
  | { kind: 'builtin' }
  | { kind: 'plugin'; pluginId: string }

export interface InspectorCardDefinition {
  id: string
  order: number
  source: InspectorCardSource
  component: ComponentType<InspectorCardProps>
}
