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
})
