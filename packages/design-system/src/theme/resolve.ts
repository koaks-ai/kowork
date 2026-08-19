import { deriveAccent } from './derive-accent'
import type { ResolveAppearanceInput, ResolvedAppearance } from './types'

export function resolveAppearance({
  appearance,
  resolvedColorScheme
}: ResolveAppearanceInput): ResolvedAppearance {
  const background = appearance.background
  const vars = {
    ...(appearance.accent.type === 'custom'
      ? deriveAccent(appearance.accent.hex, resolvedColorScheme)
      : {}),
    ...(background
      ? {
          '--kw-wallpaper-blur': `${background.blurPx}px`,
          '--kw-chrome-opacity': `${background.surfaceOpacity * 100}%`
        }
      : {})
  }
  return {
    dataset: {
      colorScheme: resolvedColorScheme,
      accent: appearance.accent.type === 'preset' ? appearance.accent.id : 'custom',
      wallpaper: background ? 'on' : 'off'
    },
    vars,
    wallpaper: background
      ? { assetId: background.assetId, url: `kowork-bg://${background.assetId}` }
      : null
  }
}
