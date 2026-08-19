import type { AppearanceSettings, ResolvedColorScheme } from '@kowork/client-settings'

export type CssVarMap = Readonly<Record<`--${string}`, string>>

export interface ResolvedAppearance {
  dataset: {
    colorScheme: ResolvedColorScheme
    accent: string
    wallpaper: 'on' | 'off'
  }
  vars: CssVarMap
  wallpaper: null | {
    assetId: string
    url: string
  }
}

export interface ResolveAppearanceInput {
  appearance: AppearanceSettings
  resolvedColorScheme: ResolvedColorScheme
}
