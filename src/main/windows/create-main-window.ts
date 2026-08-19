import { join } from 'node:path'
import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron'
import { is } from '@electron-toolkit/utils'
import { resolveSystemBackdrop } from '@kowork/contracts'
import type { ResolvedColorScheme } from '@kowork/client-settings'
import { windowCanvasColor } from '../client-settings/native-theme'
import icon from '../../../resources/icon.png?asset'

function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function windowMaterialOptions(
  resolvedColorScheme: ResolvedColorScheme
): Pick<
  BrowserWindowConstructorOptions,
  'backgroundColor' | 'backgroundMaterial' | 'vibrancy' | 'visualEffectState'
> {
  const backdrop = resolveSystemBackdrop(process.platform, process.getSystemVersion())
  if (backdrop === 'vibrancy') {
    return {
      backgroundColor: '#00000000',
      vibrancy: 'sidebar',
      visualEffectState: 'followWindow'
    }
  }
  if (backdrop === 'mica') {
    return {
      backgroundColor: '#00000000',
      backgroundMaterial: 'mica'
    }
  }
  return { backgroundColor: windowCanvasColor(resolvedColorScheme) }
}

export function createMainWindow(resolvedColorScheme: ResolvedColorScheme): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'KoWork',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...windowMaterialOptions(resolvedColorScheme),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL()
    if (url !== current) event.preventDefault()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}
