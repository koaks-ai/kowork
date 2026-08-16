// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownContent } from '../../src/renderer/src/shared/ui/MarkdownContent'

afterEach(cleanup)

describe('MarkdownContent', () => {
  it('uses the same font size for labeled and unlabeled fenced code blocks', () => {
    const view = render(
      createElement(MarkdownContent, {
        content: '```text\n正常的字体大小\n```\n\n```\n偏小的字体\n```'
      })
    )
    const blocks = [...view.container.querySelectorAll('pre')]

    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      expect(block.className).toContain('text-[0.9em]')
      expect(block.className).toContain('[&_code]:text-[1em]')
      expect(block.querySelector('code')?.className).toContain('text-[0.9em]')
    }
  })

  it('highlights fenced code when its language is specified', () => {
    const view = render(
      createElement(MarkdownContent, {
        content: '```typescript\nconst answer: number = 42\n```'
      })
    )
    const code = view.container.querySelector('pre code')

    expect(code?.classList.contains('hljs')).toBe(true)
    expect(code?.classList.contains('language-typescript')).toBe(true)
    expect(code?.querySelector('.hljs-keyword')?.textContent).toBe('const')
    expect(code?.querySelector('.hljs-number')?.textContent).toBe('42')
  })

  it('keeps highlighted code but mutes colors for reasoning tone', () => {
    const view = render(
      createElement(MarkdownContent, {
        content:
          '### Title\n\nA [link](https://example.com) and **bold**.\n\n```typescript\nconst answer: number = 42\n```',
        tone: 'muted'
      })
    )
    const root = view.container.querySelector('.kowork-markdown')
    const code = view.container.querySelector('pre code')

    expect(root?.getAttribute('data-tone')).toBe('muted')
    expect(root?.className).toContain('text-neutral-500')
    expect(view.container.querySelector('h3')?.className).toContain('text-neutral-500')
    expect(view.container.querySelector('strong')?.className).toContain('text-neutral-500')
    expect(view.container.querySelector('a')?.className).toContain('text-neutral-500')
    expect(code?.classList.contains('hljs')).toBe(true)
    expect(code?.querySelector('.hljs-keyword')?.textContent).toBe('const')
  })

  it('does not guess a language for unlabeled fenced code', () => {
    const view = render(
      createElement(MarkdownContent, {
        content: '```\nconst answer = 42\n```'
      })
    )
    const code = view.container.querySelector('pre code')

    expect(code?.classList.contains('hljs')).toBe(false)
    expect(code?.querySelector('[class^="hljs-"]')).toBeNull()
  })
})
