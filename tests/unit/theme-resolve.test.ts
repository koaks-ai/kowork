// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_CLIENT_SETTINGS } from '@kowork/client-settings'
import { applyAppearance, deriveAccent, resolveAppearance } from '@kowork/design-system/theme'

afterEach(() => {
  document.documentElement.removeAttribute('style')
  delete document.documentElement.dataset.colorScheme
  delete document.documentElement.dataset.accent
  delete document.documentElement.dataset.wallpaper
})

describe('theme resolution', () => {
  it('keeps the default light blue theme free of overlay variables', () => {
    expect(
      resolveAppearance({
        appearance: DEFAULT_CLIENT_SETTINGS.appearance,
        resolvedColorScheme: 'light'
      })
    ).toEqual({
      dataset: { colorScheme: 'light', accent: 'blue', wallpaper: 'off' },
      vars: {},
      wallpaper: null
    })
  })

  it('derives stable custom variables and chooses readable contrast', () => {
    expect(deriveAccent('#ffffff', 'light')['--kw-color-accent-contrast']).toBe('rgb(23 23 23)')
    expect(deriveAccent('#000000', 'dark')['--kw-color-accent-contrast']).toBe('rgb(255 255 255)')
    expect(deriveAccent('#888888', 'light')['--kw-color-accent-contrast']).toBe('rgb(23 23 23)')
    expect(deriveAccent('#ffffff', 'light')['--kw-color-selection-active']).toBe(
      'rgb(128 128 128 / 0.18)'
    )
    expect(deriveAccent('#000000', 'dark')['--kw-color-selection-active']).toBe(
      'rgb(166 166 166 / 0.24)'
    )
    expect(deriveAccent('#7c3aed', 'light')).toEqual(deriveAccent('#7c3aed', 'light'))
    expect(deriveAccent('#7c3aed', 'light')['--kw-color-accent-hover']).toBe('#5f14e0')
    expect(() => deriveAccent('#ABCDEF', 'light')).toThrow(
      'Custom accent must be a lowercase #rrggbb color'
    )
  })

  it('clears custom and wallpaper variables when switching back to default', () => {
    const custom = resolveAppearance({
      appearance: {
        colorScheme: 'dark',
        accent: { type: 'custom', hex: '#7c3aed' },
        background: {
          assetId: '31ce027a-f782-4da5-b914-49a20a8b84c2.png',
          blurPx: 24,
          surfaceOpacity: 0.7
        }
      },
      resolvedColorScheme: 'dark'
    })
    applyAppearance(document.documentElement, custom)
    expect(document.documentElement.style.getPropertyValue('--kw-color-accent')).toBe('#7c3aed')
    expect(document.documentElement.style.getPropertyValue('--kw-chrome-opacity')).toBe('70%')

    applyAppearance(
      document.documentElement,
      resolveAppearance({
        appearance: DEFAULT_CLIENT_SETTINGS.appearance,
        resolvedColorScheme: 'light'
      })
    )
    expect(document.documentElement.style.getPropertyValue('--kw-color-accent')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--kw-chrome-opacity')).toBe('')
  })
})
