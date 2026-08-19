import type { ClientSettings } from './schema'

export const DEFAULT_CLIENT_SETTINGS = Object.freeze({
  version: 1,
  appearance: {
    colorScheme: 'light',
    accent: { type: 'preset', id: 'default' },
    background: null
  },
  layout: {
    leftSidebarWidth: 264,
    rightSidebarWidth: 332,
    settingsProviderListWidth: 208
  },
  locale: 'zh-CN'
} satisfies ClientSettings)

export const DEFAULT_BACKGROUND = Object.freeze({ blurPx: 32, surfaceOpacity: 0.78 })
