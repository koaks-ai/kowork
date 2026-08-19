import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyAppearance, resolveAppearance } from '@kowork/design-system/theme'
import App from './App'
import { AppProviders } from './app/AppProviders'
import './shared/i18n'
import { installBrowserPreviewApi } from './shared/api/browser-preview'
import type {
  ClientSettingsBridgeApi,
  ClientSettingsBootstrapResponse,
  LegacyLayoutInput
} from '@kowork/client-settings'
import { seedAppearanceStore } from './app/appearance/appearance-store'

const LEGACY_LAYOUT_KEYS = {
  leftSidebarWidth: 'kowork:left-sidebar-width',
  rightSidebarWidth: 'kowork:right-sidebar-width',
  settingsProviderListWidth: 'kowork:settings-provider-list-width'
} as const

function bootstrapClientSettings(api: ClientSettingsBridgeApi): ClientSettingsBootstrapResponse {
  // sandbox preload 运行时还没有页面 origin，localStorage 只能在首个 renderer 脚本中读取；此处在 React 挂载前只完成一次同步握手。
  let legacyLayout: LegacyLayoutInput = {}
  try {
    legacyLayout = Object.fromEntries(
      Object.entries(LEGACY_LAYOUT_KEYS).map(([key, storageKey]) => [
        key,
        localStorage.getItem(storageKey)
      ])
    )
  } catch (error) {
    console.warn('Unable to read legacy panel widths', error)
  }
  const response = api.bootstrap(legacyLayout)
  if (response.removeLegacyKeys) {
    try {
      Object.values(LEGACY_LAYOUT_KEYS).forEach((key) => localStorage.removeItem(key))
    } catch (error) {
      console.warn('Unable to remove migrated panel widths', error)
    }
  }
  return response
}

installBrowserPreviewApi()

document.documentElement.dataset.platform = window.kowork.platform.os
document.documentElement.dataset.systemBackdrop = window.kowork.platform.backdrop
const clientSettings = (
  window.kowork as typeof window.kowork & { clientSettings: ClientSettingsBridgeApi }
).clientSettings
const initialClientSettings = bootstrapClientSettings(clientSettings).state
seedAppearanceStore(initialClientSettings)
if (initialClientSettings.status === 'ready') {
  applyAppearance(
    document.documentElement,
    resolveAppearance({
      appearance: initialClientSettings.snapshot.appearance,
      resolvedColorScheme: initialClientSettings.snapshot.resolvedColorScheme
    })
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>
)
