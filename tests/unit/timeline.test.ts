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
  it('classifies model text by step and preserves the raw final response', () => {
    const items = collectTimeline([
      event(1, 'run.started', { input: '检查项目' }),
      event(2, 'run.text', { text: '我先检查。', step: 1 }),
      event(3, 'run.tool-call', {
        call: { id: 'call-1', name: 'read_file', argumentsJson: '{"path":"README.md"}' }
      }),
      event(4, 'run.tool-output', { callId: 'call-1', text: 'ok', isError: false }),
      event(5, 'run.text', { text: '## 结果\n\n', step: 2 }),
      event(6, 'run.text', { text: '检查完成。', step: 2 }),
      event(7, 'run.completed', {
        usage: {},
        finalText: '## 结果\n\n检查完成。',
        finalStep: 2
      })
    ])

    const text = items[0]?.activities.filter((activity) => activity.kind === 'text') ?? []
    expect(text).toMatchObject([
      { role: 'process', text: '我先检查。', step: 1 },
      { role: 'final', text: '## 结果\n\n检查完成。', step: 2 }
    ])
    expect(items[0]?.finalText).toBe('## 结果\n\n检查完成。')
    expect(items[0]?.copyText).toBe('## 结果\n\n检查完成。')
  })

  it('uses the last text activity as the final response for existing history', () => {
    const items = collectTimeline([
      event(1, 'run.started', { input: '旧会话' }),
      event(2, 'run.text', { text: '过程说明' }),
      event(3, 'run.tool-call', {
        call: { id: 'call-1', name: 'read_file', argumentsJson: '{}' }
      }),
      event(4, 'run.text', { text: '旧版最终回复' }),
      event(5, 'run.completed', { usage: {} })
    ])

    const text = items[0]?.activities.filter((activity) => activity.kind === 'text') ?? []
    expect(text.map((activity) => activity.role)).toEqual(['process', 'final'])
    expect(items[0]?.finalText).toBe('旧版最终回复')
    expect(items[0]?.copyText).toBe('过程说明旧版最终回复')
  })

  it('copies every text activity when the run has no final response', () => {
    const items = collectTimeline([
      event(1, 'run.started', { input: '只执行过程' }),
      event(2, 'run.text', { text: '第一段过程\n', step: 1 }),
      event(3, 'run.tool-call', {
        call: { id: 'call-1', name: 'read_file', argumentsJson: '{}' }
      }),
      event(4, 'run.text', { text: '第二段过程', step: 2 }),
      event(5, 'run.completed', { finalText: '', finalStep: 3, usage: {} })
    ])

    expect(items[0]?.finalText).toBeUndefined()
    expect(items[0]?.copyText).toBe('第一段过程\n第二段过程')
  })

  it('associates shell stream chunks with their tool call without creating an unknown tool', () => {
    const items = collectTimeline([
      event(1, 'run.started', { input: '当前目录是什么？' }),
      event(2, 'run.tool-call', {
        call: { id: 'call-1', name: 'run_command', argumentsJson: '{"command":"pwd"}' }
      }),
      event(3, 'run.tool-output', {
        callId: 'call-1',
        stream: 'stdout',
        text: '/workspace'
      }),
      event(4, 'run.tool-output', {
        callId: 'call-1',
        stream: 'stdout',
        text: '\n'
      }),
      event(5, 'run.tool-output', {
        callId: 'call-1',
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

  it('projects semantic model events without merging reasoning kinds', () => {
    const items = collectTimeline([
      event(1, 'run.started', { input: '检查来源' }),
      event(4, 'run.reasoning', {
        text: '摘要',
        kind: 'summary',
        itemRef: 'reason-1'
      }),
      event(5, 'run.reasoning', {
        text: '原始推理',
        kind: 'raw',
        itemRef: 'reason-1'
      }),
      event(6, 'run.tool-call-delta', {
        step: 0,
        phase: 'normal',
        event: {
          type: 'tool_call_delta',
          id: 'call-1',
          nameDelta: 'read_file',
          argumentsDelta: '{"path":"',
          itemRef: 'tool-1'
        }
      }),
      event(7, 'run.tool-call-delta', {
        step: 0,
        phase: 'normal',
        event: {
          type: 'tool_call_delta',
          id: 'call-1',
          argumentsDelta: 'README.md"}',
          itemRef: 'tool-1'
        }
      }),
      event(8, 'run.tool-call', {
        call: {
          id: 'call-1',
          name: 'read_file',
          argumentsJson: '{"path":"README.md"}'
        }
      }),
      event(9, 'run.refusal', {
        step: 1,
        phase: 'normal',
        event: { type: 'refusal_delta', text: '无法执行该请求。', itemRef: 'message-1' }
      }),
      event(10, 'run.annotation', {
        step: 1,
        phase: 'normal',
        event: {
          type: 'annotation_added',
          itemRef: 'message-1',
          annotation: {
            type: 'url_citation',
            url: 'https://example.com/source',
            title: 'Source'
          }
        }
      }),
      event(12, 'run.completed', { finalText: '', finalStep: 2, usage: {} })
    ])

    const activities = items[0]?.activities ?? []
    const reasoning = activities.filter((activity) => activity.kind === 'reasoning')
    const tool = activities.find((activity) => activity.kind === 'tool')
    const refusal = activities.find((activity) => activity.kind === 'refusal')
    const annotations = activities.find((activity) => activity.kind === 'annotations')

    expect(reasoning).toMatchObject([
      { reasoningKind: 'summary', itemRef: 'reason-1', text: '摘要' },
      { reasoningKind: 'raw', itemRef: 'reason-1', text: '原始推理' }
    ])
    expect(tool).toMatchObject({
      callId: 'call-1',
      name: 'read_file',
      argumentsJson: '{"path":"README.md"}',
      requested: true
    })
    expect(refusal).toMatchObject({ text: '无法执行该请求。', itemRef: 'message-1' })
    expect(annotations?.annotations).toEqual([
      expect.objectContaining({ type: 'url_citation', title: 'Source' })
    ])
    expect(items[0]?.copyText).toBe('无法执行该请求。')
  })
})
