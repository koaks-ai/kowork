import type { AgentRuntimePort, AgentStreamEvent } from './runtime-port'
import { createFallbackThreadTitle } from '../../domain/thread-title'

export class FakeAgentRuntime implements AgentRuntimePort {
  generateTitle(input: Parameters<AgentRuntimePort['generateTitle']>[0]): Promise<string> {
    return Promise.resolve(createFallbackThreadTitle(input.message))
  }

  compressIfNeeded(): Promise<void> {
    return Promise.resolve()
  }

  async *stream(input: Parameters<AgentRuntimePort['stream']>[0]): AsyncIterable<AgentStreamEvent> {
    yield {
      type: 'model',
      step: 0,
      phase: 'normal',
      event: {
        type: 'provider_event',
        providerId: 'openai-responses',
        protocolId: 'openai-responses',
        eventType: 'response.created',
        source: 'sse',
        eventId: 'fake-event-1',
        sequenceNumber: 1,
        payload: '{"type":"response.created","response":{"id":"fake-response"}}'
      }
    }
    yield {
      type: 'model',
      step: 0,
      phase: 'normal',
      event: { type: 'started', responseId: 'fake-response' }
    }
    yield { type: 'text_delta', text: '我先确认一下当前项目。', itemRef: 'message-process' }
    yield {
      type: 'reasoning_delta',
      text: '我会先确认项目中的 **README** 文件，再读取内容检查当前状态。',
      itemRef: 'reasoning-summary',
      kind: 'summary'
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
    const toolCallId = `read-readme-${input.runId}`
    const providerToolCallId = `provider-read-readme-${input.runId}`
    yield {
      type: 'model',
      step: 0,
      phase: 'normal',
      event: {
        type: 'tool_call_delta',
        id: providerToolCallId,
        index: 0,
        nameDelta: 'read_file',
        argumentsDelta: JSON.stringify({ path: 'README.md', startLine: 1, endLine: 80 }),
        itemRef: toolCallId
      }
    }
    yield {
      type: 'tool_call_requested',
      call: {
        id: toolCallId,
        name: 'read_file',
        argumentsJson: JSON.stringify({ path: 'README.md', startLine: 1, endLine: 80 })
      }
    }
    yield { type: 'step_completed', step: 1 }
    await new Promise((resolve) => setTimeout(resolve, 40))
    yield {
      type: 'tool_result',
      callId: toolCallId,
      output: 'README.md 已读取，共 3 行。',
      isError: false
    }
    yield {
      type: 'reasoning_delta',
      text: 'README 已成功读取。我会保留检查结果，并给出简洁的执行结论。',
      itemRef: 'reasoning-raw',
      kind: 'raw'
    }
    yield {
      type: 'model',
      step: 1,
      phase: 'normal',
      event: {
        type: 'annotation_added',
        itemRef: 'message-final',
        annotation: {
          type: 'file_citation',
          fileId: 'README.md',
          filename: 'README.md',
          startIndex: 0,
          endIndex: 9
        }
      }
    }
    const response = `已收到任务：${input.request.input}\n\n### 检查结果\n\n- 已读取 \`README.md\`\n- 当前内容可正常访问\n\n这是 KoWork 测试运行时生成的**流式回复**。`
    for (const text of response.match(/.{1,8}/gs) ?? []) {
      if (input.signal.aborted) throw input.signal.reason
      await new Promise((resolve) => setTimeout(resolve, 20))
      yield { type: 'text_delta', text, itemRef: 'message-final' }
    }
    yield { type: 'step_completed', step: 2 }
    yield {
      type: 'completed',
      finalText: response,
      usage: {
        promptTokens: 24,
        completionTokens: 32,
        totalTokens: 56,
        cachedInputTokens: 0,
        reasoningOutputTokens: 24
      }
    }
  }

  close(): Promise<void> {
    return Promise.resolve()
  }
}
