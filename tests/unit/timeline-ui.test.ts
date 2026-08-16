// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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

afterEach(cleanup)

describe('reasoning timeline activity', () => {
  it('uses a ten-line plain-text preview and reveals the full text on demand', () => {
    const initialText = '**literal markdown**\n2\n3\n4\n5\n6\n7'
    const view = render(createElement(Timeline, { events: [started, reasoning(initialText)] }))
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
    view.rerender(createElement(Timeline, { events: [started, reasoning(updatedText)] }))
    expect(text.scrollTop).toBe(400)

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(text.classList).not.toContain('max-h-60')

    view.rerender(createElement(Timeline, { events: [started, reasoning(updatedText), completed] }))
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
    const view = render(
      createElement(StrictMode, null, createElement(Timeline, { events: [started, streamed] }))
    )

    await waitFor(() => expect(view.queryByText('正在流式输出正文')).not.toBeNull())
    expect(view.container.querySelector('[data-streaming="true"]')).not.toBeNull()
  })
})
