// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement, StrictMode } from 'react'
import type { RunEventDto } from '@kowork/contracts'
import { Timeline } from '../../src/renderer/src/features/chat/Timeline'
import '../../src/renderer/src/shared/i18n'

const started: RunEventDto = {
  sequence: 1,
  id: 'started',
  projectId: 'project',
  threadId: 'thread',
  runId: 'run',
  type: 'run.started',
  payload: { input: 'test' },
  createdAt: 1
}

function reasoning(text: string): RunEventDto {
  return {
    sequence: 2,
    id: 'reasoning',
    projectId: 'project',
    threadId: 'thread',
    runId: 'run',
    type: 'run.reasoning',
    payload: { text },
    createdAt: 2
  }
}

const completed: RunEventDto = {
  sequence: 3,
  id: 'completed',
  projectId: 'project',
  threadId: 'thread',
  runId: 'run',
  type: 'run.completed',
  payload: {},
  createdAt: 3
}

function timeline(events: RunEventDto[]): React.ReactElement {
  return createElement(Tooltip.Provider, null, createElement(Timeline, { events }))
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('reasoning timeline activity', () => {
  it('uses a ten-line plain-text preview and reveals the full text on demand', () => {
    const initialText = '**literal markdown**\n2\n3\n4\n5\n6\n7'
    const view = render(timeline([started, reasoning(initialText)]))
    const activity = view.container.querySelector('[data-run-content="reasoning"]')!
    const toggle = activity.querySelector('button')!
    const text = activity.querySelector('pre')!

    expect(text.textContent).toBe(initialText)
    expect(text.querySelector('strong')).toBeNull()
    expect(text.classList).toContain('max-h-60')
    expect(text.classList).toContain('select-text')
    expect(text.className).not.toContain('pl-')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    Object.defineProperty(text, 'scrollHeight', { configurable: true, value: 400 })
    const updatedText = `${initialText}\n8`
    view.rerender(timeline([started, reasoning(updatedText)]))
    expect(text.scrollTop).toBe(400)

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(text.classList).not.toContain('max-h-60')

    view.rerender(timeline([started, reasoning(updatedText), completed]))
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(text.classList).not.toContain('max-h-60')
  })

  it('reveals streamed Markdown before the run completes in strict mode', async () => {
    const streamed: RunEventDto = {
      sequence: 2,
      id: 'streamed-text',
      projectId: 'project',
      threadId: 'thread',
      runId: 'run',
      type: 'run.text',
      payload: { text: '正在流式输出正文' },
      createdAt: 2
    }
    const view = render(createElement(StrictMode, null, timeline([started, streamed])))

    await waitFor(() => expect(view.queryByText('正在流式输出正文')).not.toBeNull())
    expect(view.container.querySelector('[data-streaming="true"]')).not.toBeNull()
  })

  it('copies the raw final response and replaces the completed label with actions', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    const finalText = '## 最终结果\n\n保留 **Markdown**。'
    const processText: RunEventDto = {
      ...started,
      sequence: 2,
      id: 'process-text',
      type: 'run.text',
      payload: { text: '我先检查一下。', step: 1 },
      createdAt: 2
    }
    const finalOutput: RunEventDto = {
      ...started,
      sequence: 3,
      id: 'final-text',
      type: 'run.text',
      payload: { text: finalText, step: 2 },
      createdAt: 3
    }
    const finished: RunEventDto = {
      ...completed,
      sequence: 4,
      payload: { finalText, finalStep: 2 },
      createdAt: 4
    }
    const view = render(timeline([started, processText, finalOutput, finished]))

    expect(
      [...view.container.querySelectorAll('[data-output-kind]')].map((element) =>
        element.getAttribute('data-output-kind')
      )
    ).toEqual(['process', 'final'])
    expect(view.queryByText('已完成')).toBeNull()

    const copyButton = view.getByRole('button', { name: '复制最终回复' })
    expect(copyButton.querySelector('.lucide-copy')).not.toBeNull()
    await act(async () => {
      fireEvent.click(copyButton)
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith(finalText)
    expect(copyButton.querySelector('.lucide-check')).not.toBeNull()
    expect(copyButton.getAttribute('aria-label')).toBe('已复制')

    act(() => vi.advanceTimersByTime(4_999))
    expect(copyButton.querySelector('.lucide-check')).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(copyButton.querySelector('.lucide-copy')).not.toBeNull()
    expect(copyButton.getAttribute('aria-label')).toBe('复制最终回复')
    expect(
      (view.getByRole('button', { name: '创建分支（暂不可用）' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('allows selecting and copying the user message with copied feedback', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    const view = render(timeline([started, completed]))
    const message = view.container.querySelector('[data-user-message]')!

    expect(message.classList).toContain('select-text')
    const copyButton = view.getByRole('button', { name: '复制消息' })
    await act(async () => {
      fireEvent.click(copyButton)
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith('test')
    expect(copyButton.getAttribute('aria-label')).toBe('已复制')
    expect(copyButton.querySelector('.lucide-check')).not.toBeNull()

    act(() => vi.advanceTimersByTime(5_000))
    expect(copyButton.getAttribute('aria-label')).toBe('复制消息')
    expect(copyButton.querySelector('.lucide-copy')).not.toBeNull()
  })

  it('copies all model text when no final response was produced', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    const firstText: RunEventDto = {
      ...started,
      sequence: 2,
      id: 'first-process-text',
      type: 'run.text',
      payload: { text: '第一段过程\n', step: 1 },
      createdAt: 2
    }
    const secondText: RunEventDto = {
      ...started,
      sequence: 3,
      id: 'second-process-text',
      type: 'run.text',
      payload: { text: '第二段过程', step: 2 },
      createdAt: 3
    }
    const finished: RunEventDto = {
      ...completed,
      sequence: 4,
      payload: { finalText: '', finalStep: 3 },
      createdAt: 4
    }
    const view = render(timeline([started, firstText, secondText, finished]))

    fireEvent.click(view.getByRole('button', { name: '复制最终回复' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('第一段过程\n第二段过程'))
  })
})
