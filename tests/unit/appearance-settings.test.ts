// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CLIENT_SETTINGS } from '@kowork/client-settings'
import { AccentField } from '../../src/renderer/src/features/settings/appearance/AccentField'
import { ColorSchemeField } from '../../src/renderer/src/features/settings/appearance/ColorSchemeField'
import { WallpaperField } from '../../src/renderer/src/features/settings/appearance/WallpaperField'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

afterEach(() => cleanup())

describe('appearance settings fields', () => {
  it('patches color scheme and preset accent through complete appearance values', () => {
    const onSchemeChange = vi.fn()
    const onAccentChange = vi.fn()
    render(
      createElement(ColorSchemeField, {
        appearance: DEFAULT_CLIENT_SETTINGS.appearance,
        onChange: onSchemeChange
      })
    )
    fireEvent.click(document.querySelector('button:nth-of-type(2)')!)
    expect(onSchemeChange).toHaveBeenCalledWith({
      ...DEFAULT_CLIENT_SETTINGS.appearance,
      colorScheme: 'dark'
    })

    cleanup()
    render(
      createElement(AccentField, {
        appearance: DEFAULT_CLIENT_SETTINGS.appearance,
        onChange: onAccentChange
      })
    )
    expect(
      (document.querySelector("[data-accent-option='default']") as HTMLElement | null)?.dataset
        .selected
    ).toBe('true')
    fireEvent.click(document.querySelector("[data-accent-option='violet']")!)
    expect(onAccentChange).toHaveBeenCalledWith({
      ...DEFAULT_CLIENT_SETTINGS.appearance,
      accent: { type: 'preset', id: 'violet' }
    })
  })

  it('disables wallpaper controls and explains why when no background is selected', () => {
    const view = render(
      createElement(WallpaperField, {
        appearance: DEFAULT_CLIENT_SETTINGS.appearance,
        onChange: vi.fn()
      })
    )
    const sliders = view.getAllByRole('slider')
    expect(sliders).toHaveLength(2)
    expect(sliders.every((slider) => slider.hasAttribute('disabled'))).toBe(true)
    expect(view.getByText('appearanceWallpaperDisabled')).toBeTruthy()
  })

  it('exposes stable labeled controls for wallpaper blur and opacity', () => {
    const appearance = {
      ...DEFAULT_CLIENT_SETTINGS.appearance,
      background: {
        assetId: '31ce027a-f782-4da5-b914-49a20a8b84c2.png',
        blurPx: 24,
        surfaceOpacity: 0.65
      }
    }
    const view = render(
      createElement(WallpaperField, {
        appearance,
        onChange: vi.fn()
      })
    )
    expect(view.getByRole('slider', { name: 'appearanceBlur' })).toHaveProperty('value', '24')
    expect(view.getByRole('slider', { name: 'appearanceSurfaceOpacity' })).toHaveProperty(
      'value',
      '0.65'
    )
  })
})
