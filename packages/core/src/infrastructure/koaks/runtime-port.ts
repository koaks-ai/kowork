import type { AgentEvent, Usage } from '@koaks/node'
import type { ModelProfileDto, ProjectDto, QueuedRequestDto, ThreadDto } from '@kowork/contracts'

export type AgentUsage = Usage

export type AgentStreamEvent =
  | Exclude<AgentEvent, { type: 'completed' }>
  | { type: 'completed'; usage: AgentUsage; finalText: string }

export interface AgentRuntimePort {
  generateTitle(input: {
    message: string
    profile: ModelProfileDto
    signal: AbortSignal
  }): Promise<string>
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
