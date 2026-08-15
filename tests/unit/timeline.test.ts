import { describe, expect, it } from 'vitest'
import type { RunEventDto } from '@kowork/contracts'
import { collectTimeline } from '../../src/renderer/src/features/chat/timeline-model'

function event(
  sequence: number,
  type: RunEventDto['type'],
  payload: Record<string, unknown>
): RunEventDto {
  return {
    sequence,
    id: `event-${sequence}`,
    projectId: 'project-1',
    threadId: 'thread-1',
    runId: 'run-1',
    type,
    payload,
    createdAt: sequence
  }
}

describe('chat timeline', () => {
  it('associates shell stream chunks with their tool call without creating an unknown tool', () => {
    const items = collectTimeline([
      event(1, 'run.started', { input: '当前目录是什么？' }),
      event(2, 'run.tool-call', {
        call: { id: 'call-1', name: 'run_command', argumentsJson: '{"command":"pwd"}' }
      }),
      event(3, 'run.tool-output', {
        executionId: 'tool-execution-1',
        toolName: 'run_command',
        command: 'pwd',
        stream: 'stdout',
        text: '/workspace'
      }),
      event(4, 'run.tool-output', {
        executionId: 'tool-execution-1',
        toolName: 'run_command',
        command: 'pwd',
        stream: 'stdout',
        text: '\n'
      }),
      event(5, 'run.tool-output', {
        executionId: 'tool-execution-1',
        toolName: 'run_command',
        command: 'pwd',
        stream: 'status',
        text: '\n[exit code: 0]'
      }),
      event(6, 'run.tool-output', {
        callId: 'call-1',
        text: '/workspace\n\n[exit code: 0]',
        isError: false
      }),
      event(7, 'run.completed', { usage: {} })
    ])

    const tools = items[0]?.activities.filter((activity) => activity.kind === 'tool') ?? []
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      callId: 'call-1',
      name: 'run_command',
      output: '/workspace\n\n[exit code: 0]',
      isError: false
    })
  })
})
