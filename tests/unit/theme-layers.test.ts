import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const stylesRoot = 'packages/design-system/src/styles'

function variables(css: string): Set<string> {
  return new Set(Array.from(css.matchAll(/(--kw-[a-z0-9-]+)\s*:/gu), (match) => match[1]!))
}

describe('theme layers', () => {
  it('keeps the Phase 1 light selection values as the frozen root baseline', async () => {
    const tokens = await readFile(`${stylesRoot}/tokens.css`, 'utf8')
    expect(tokens).toContain('--kw-color-selection-active: rgb(229 229 229 / 0.7);')
    expect(tokens).toContain('--kw-color-selection-hover: #f5f5f5;')
    expect(tokens).toContain('--kw-color-selection-active-frosted: rgb(0 0 0 / 0.1);')
    expect(tokens).toContain('--kw-color-selection-hover-frosted: rgb(0 0 0 / 0.04);')
  })

  it('defines every palette-sensitive color token for dark mode', async () => {
    const [tokens, palettes] = await Promise.all([
      readFile(`${stylesRoot}/tokens.css`, 'utf8'),
      readFile(`${stylesRoot}/palettes.css`, 'utf8')
    ])
    const rootColors = [...variables(tokens)].filter(
      (name) => name.startsWith('--kw-color-') && name !== '--kw-color-chrome'
    )
    const darkColors = variables(palettes)
    expect(rootColors.filter((name) => !darkColors.has(name))).toEqual([])
  })

  it('keeps raised surfaces opaque and gives dark blue an accent selection', async () => {
    const [accents, layers, primitives] = await Promise.all([
      readFile(`${stylesRoot}/accents.css`, 'utf8'),
      readFile(`${stylesRoot}/theme-layers.css`, 'utf8'),
      readFile(`${stylesRoot}/primitives.css`, 'utf8')
    ])
    expect(accents).toMatch(
      /data-color-scheme='dark'\]\[data-accent='blue'\][\s\S]*--kw-color-selection-active-strong: rgb\(96 165 250 \/ 0\.32\)/u
    )
    expect(layers).toMatch(
      /\.kw-raised\s*\{\s*background:\s*var\(--kw-color-surface-raised\);\s*\}/u
    )
    expect(primitives).toContain('background: var(--kw-color-surface-raised)')
  })
})
