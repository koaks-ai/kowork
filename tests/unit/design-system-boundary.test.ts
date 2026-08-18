import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = resolve(import.meta.dirname, '../..')
const rendererRoot = join(workspace, 'src/renderer/src')
const designSystemRoot = join(workspace, 'packages/design-system/src')
const sourceExtensions = new Set(['.ts', '.tsx', '.css'])

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return sourceExtensions.has(extname(path)) ? [path] : []
  })
}

function violations(files: string[], pattern: RegExp): string[] {
  return files.flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return pattern.test(source) ? [relative(workspace, file)] : []
  })
}

describe('design-system boundary', () => {
  const rendererFiles = sourceFiles(rendererRoot)

  it('keeps raw color literals exclusively in design-system tokens.css', () => {
    const rawColor = /#[\da-f]{3,8}\b|\brgba?\s*\(/i
    expect(violations(rendererFiles, rawColor)).toEqual([])

    const nonTokenDesignFiles = sourceFiles(designSystemRoot).filter(
      (file) => file !== join(designSystemRoot, 'styles/tokens.css')
    )
    expect(violations(nonTokenDesignFiles, rawColor)).toEqual([])
  })

  it('prevents renderer components from using palette color utilities', () => {
    const paletteClass = /(?:^|[\s:'"`])(?:bg|text|border|ring|outline|shadow|fill|stroke|from|via|to)-(?:neutral|blue|red|green|yellow|amber|orange|gray|slate|zinc|stone|sky|cyan|teal|emerald|lime|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-|\b)/
    expect(violations(rendererFiles, paletteClass)).toEqual([])
  })

  it('allows only the token-backed radius scale', () => {
    const invalidRadius = /\brounded(?:-2xl|-3xl|-none|\s|-\[)|border-radius\s*:(?!\s*var\(--kw-radius-)/
    expect(violations(rendererFiles, invalidRadius)).toEqual([])
  })

  it('keeps motion definitions out of renderer business code', () => {
    const businessMotion = /@keyframes|\bcubic-bezier\s*\(|\b(?:animation|transition)(?:-duration|-timing-function)?\s*:|\b(?:duration|ease)-[^\s'"`]+/
    expect(violations(rendererFiles, businessMotion)).toEqual([])
  })

  it('applies the semantic overlay token to the Reveal overlay variant', () => {
    const motionCss = readFileSync(join(designSystemRoot, 'styles/motion.css'), 'utf8')
    expect(motionCss).toMatch(
      /\.kw-reveal-overlay\s*\{[^}]*background-color:\s*var\(--kw-color-overlay\)/s
    )
  })

  it('anchors the selectable highlight to the list origin', () => {
    const primitivesCss = readFileSync(join(designSystemRoot, 'styles/primitives.css'), 'utf8')
    expect(primitivesCss).toMatch(
      /\.kw-selectable-highlight\s*\{[^}]*top:\s*0;[^}]*left:\s*0;/s
    )
  })

  it('uses continuous width motion for collapsible panels', () => {
    const primitivesCss = readFileSync(join(designSystemRoot, 'styles/primitives.css'), 'utf8')
    expect(primitivesCss).toMatch(
      /\.kw-panel-visibility\s*\{[^}]*transition:[^}]*width var\(--kw-motion-selection-duration\)/s
    )
    expect(primitivesCss).toMatch(
      /\.kw-panel-visibility__content\s*\{[^}]*transition:[^}]*transform var\(--kw-motion-selection-duration\)/s
    )
    expect(primitivesCss).toMatch(
      /\.kw-panel-visibility\[data-collapsed='true'\]\s+\.kw-panel-visibility__content\s*\{[^}]*transform:\s*translateX\(-14px\)/s
    )
    expect(primitivesCss).not.toMatch(
      /\.kw-panel-visibility(?:__content)?[^}]*opacity\s*:/s
    )
  })

  it('uses the full item bounds for selectable hover and fill backgrounds', () => {
    const primitivesCss = readFileSync(join(designSystemRoot, 'styles/primitives.css'), 'utf8')
    expect(primitivesCss).toMatch(
      /\.kw-selectable-item::before\s*\{[^}]*inset:\s*0;/s
    )
  })

  it('keeps the first selectable highlight placement static before enabling sliding', () => {
    const primitivesCss = readFileSync(join(designSystemRoot, 'styles/primitives.css'), 'utf8')
    expect(primitivesCss).toMatch(
      /\.kw-selectable-highlight\s*\{[^}]*transition:\s*none;/s
    )
    expect(primitivesCss).toMatch(
      /\.kw-selectable-highlight\[data-highlight-ready='true'\]\s*\{[^}]*transform/s
    )
  })

  it('keeps portalled context menus above renderer panel dividers', () => {
    const primitivesCss = readFileSync(join(designSystemRoot, 'styles/primitives.css'), 'utf8')
    expect(primitivesCss).toMatch(
      /\.kw-context-menu\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*70;/s
    )
  })

  it('uses the shared light tooltip surface and reveal motion', () => {
    const primitivesCss = readFileSync(join(designSystemRoot, 'styles/primitives.css'), 'utf8')
    const motionCss = readFileSync(join(designSystemRoot, 'styles/motion.css'), 'utf8')
    expect(primitivesCss).toMatch(
      /\.kw-tooltip\s*\{[^}]*background:\s*var\(--kw-color-surface-subtle\);[^}]*color:\s*var\(--kw-color-text-secondary\);/s
    )
    expect(motionCss).toMatch(
      /\.kw-tooltip\s*\{[^}]*kw-reveal-fade-in[^}]*kw-reveal-scale-in/s
    )
    expect(motionCss).toMatch(/\.kw-tooltip\[data-state='closed'\]\s*\{[^}]*kw-reveal-fade-out/s)
  })

  it('removes the legacy shared implementations and selectors', () => {
    const removedFiles = [
      'AnimatedDisclosure.tsx',
      'BlurReveal.tsx',
      'BlurSwapText.tsx',
      'ContextMenu.tsx',
      'IconButton.tsx',
      'OrbitSquares.tsx',
      'SelectionList.tsx'
    ].map((file) => join(rendererRoot, 'shared/ui', file))
    expect(removedFiles.filter(existsSync)).toEqual([])
    expect(
      violations(rendererFiles, /kowork-(?:select|blur|disclosure|hover-fill)/)
    ).toEqual([])
  })
})
