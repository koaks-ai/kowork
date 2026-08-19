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

  it('keeps raised surfaces opaque and gives blue an accent selection in both schemes', async () => {
    const [accents, layers, primitives, tokens, palettes] = await Promise.all([
      readFile(`${stylesRoot}/accents.css`, 'utf8'),
      readFile(`${stylesRoot}/theme-layers.css`, 'utf8'),
      readFile(`${stylesRoot}/primitives.css`, 'utf8'),
      readFile(`${stylesRoot}/tokens.css`, 'utf8'),
      readFile(`${stylesRoot}/palettes.css`, 'utf8')
    ])
    expect(accents).toMatch(
      /data-color-scheme='light'\]\[data-accent='blue'\][\s\S]*--kw-color-selection-active-strong: rgb\(37 99 235 \/ 0\.27\)/u
    )
    expect(accents).toMatch(
      /data-color-scheme='light'\]\[data-accent='default'\][\s\S]*--kw-color-accent: #737373[\s\S]*--kw-color-selection-active: rgb\(229 229 229 \/ 0\.7\)/u
    )
    expect(accents).toMatch(
      /data-color-scheme='dark'\]\[data-accent='default'\][\s\S]*--kw-color-accent: #a3a3a3[\s\S]*--kw-color-selection-active: rgb\(255 255 255 \/ 0\.13\)/u
    )
    expect(accents).toMatch(
      /data-color-scheme='dark'\]\[data-accent='blue'\][\s\S]*--kw-color-selection-active-strong: rgb\(96 165 250 \/ 0\.32\)/u
    )
    expect(layers).toMatch(
      /\.kw-raised\s*\{\s*background:\s*var\(--kw-color-surface-raised\);\s*\}/u
    )
    expect(layers).toMatch(
      /\.kw-wallpaper-layer__image\s*\{[^}]*width:\s*calc\(100% \+ 160px\);[^}]*max-width:\s*none;/su
    )
    expect(primitives).toContain('background: var(--kw-color-surface-raised)')
    expect(tokens).toContain('--kw-color-sidebar-frosted: rgb(255 255 255 / 0.48);')
    expect(palettes).toContain('--kw-color-sidebar-frosted: rgb(48 48 48 / 0.6);')
    expect(layers).toContain('--kw-color-sidebar-chrome: var(--kw-color-sidebar-surface);')
    expect(layers).toContain('--kw-color-sidebar-chrome: var(--kw-color-sidebar-frosted);')
    expect(layers).toMatch(/--kw-color-sidebar-chrome: color-mix\([\s\S]*--kw-sidebar-opacity/u)
  })

  it('uses one chrome layer per workbench column and the same blur on both titlebars', async () => {
    const [app, workspace, inspector] = await Promise.all([
      readFile('src/renderer/src/App.tsx', 'utf8'),
      readFile('src/renderer/src/widgets/ConversationWorkspace.tsx', 'utf8'),
      readFile('src/renderer/src/features/inspector/InspectorPanel.tsx', 'utf8')
    ])
    expect(app).not.toMatch(/<div[^>]*className="[^"]*kw-chrome[^"]*flex min-h-0 min-w-0 flex-1/u)
    expect(workspace).toMatch(/data-workspace-titlebar[\s\S]*kw-titlebar-blur/u)
    expect(inspector).toMatch(/data-inspector-titlebar[\s\S]*kw-titlebar-blur/u)
  })
})
