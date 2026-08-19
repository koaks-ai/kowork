import { BrowserWindow, nativeTheme } from 'electron'
import { resolveSystemBackdrop } from '@kowork/contracts'
import type { ClientSettings, ResolvedColorScheme } from '@kowork/client-settings'
import type { ClientSettingsStore } from './store'

export function resolveNativeColorScheme(
  preference: ClientSettings['appearance']['colorScheme']
): ResolvedColorScheme {
  if (preference === 'light' || preference === 'dark') return preference
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

export function windowCanvasColor(scheme: ResolvedColorScheme): string {
  return scheme === 'dark' ? '#1c1c1c' : '#ffffff'
}

function updateWindowBackgrounds(scheme: ResolvedColorScheme): void {
  if (resolveSystemBackdrop(process.platform, process.getSystemVersion()) !== 'none') return
  const color = windowCanvasColor(scheme)
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.setBackgroundColor(color)
  }
}

export function synchronizeNativeTheme(store: ClientSettingsStore): () => void {
  const synchronize = (): void => {
    const state = store.getState()
    if (state.status !== 'ready') return
    nativeTheme.themeSource = state.snapshot.appearance.colorScheme
    store.refreshResolvedColorScheme()
    const refreshed = store.getState()
    if (refreshed.status === 'ready')
      updateWindowBackgrounds(refreshed.snapshot.resolvedColorScheme)
  }
  const unsubscribe = store.subscribe(synchronize)
  const onUpdated = (): void => {
    const state = store.getState()
    if (state.status !== 'ready' || state.snapshot.appearance.colorScheme !== 'system') return
    store.refreshResolvedColorScheme()
    const refreshed = store.getState()
    if (refreshed.status === 'ready')
      updateWindowBackgrounds(refreshed.snapshot.resolvedColorScheme)
  }
  nativeTheme.on('updated', onUpdated)
  synchronize()
  return () => {
    unsubscribe()
    nativeTheme.removeListener('updated', onUpdated)
  }
}
