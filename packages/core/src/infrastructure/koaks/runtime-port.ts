import type { ModelProfileDto, ProjectDto, QueuedRequestDto, ThreadDto } from '@kowork/contracts'

export interface AgentUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedInputTokens: number
  reasoningOutputTokens: number
}

export type AgentStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_call_requested'; call: { id: string; name: string; argumentsJson: string } }
  | { type: 'tool_result'; callId: string; output: string; isError: boolean }
  | {
      type: 'tool_progress'
      callId: string
      progress:
        | { type: 'output'; text: string; stream?: 'stdout' | 'stderr' }
        | { type: 'status'; message: string }
        | { type: 'custom'; kind: string; payload: unknown }
    }
  | { type: 'step_completed'; step: number }
  | { type: 'completed'; usage: AgentUsage }
  | { type: 'incomplete'; usage: AgentUsage; reason: Record<string, unknown> }
  | { type: 'terminated'; usage?: AgentUsage; reason: Record<string, unknown> }
  | { type: 'failed'; usage: AgentUsage; error: { message: string; type: string } }

export interface AgentRuntimePort {
  compressIfNeeded(input: {
    project: ProjectDto
    thread: ThreadDto
    request: QueuedRequestDto
    profile: ModelProfileDto
    signal: AbortSignal
  }): Promise<void>
  stream(input: {
    project: ProjectDto
    thread: ThreadDto
    request: QueuedRequestDto
    runId: string
    signal: AbortSignal
  }): AsyncIterable<AgentStreamEvent>
  close(): Promise<void>
}
