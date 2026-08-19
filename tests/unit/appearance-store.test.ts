// @vitest-environment jsdom

import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CLIENT_SETTINGS,
  type AppearanceSettings,
  type ClientSettingsBridgeApi,
  type ClientSettingsSnapshot,
  type ClientSettingsState
} from '@kowork/client-settings'

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function snapshot(appearance: AppearanceSettings): ClientSettingsSnapshot {
  return {
    ...structuredClone(DEFAULT_CLIENT_SETTINGS),
    appearance,
    resolvedColorScheme: appearance.colorScheme === 'dark' ? 'dark' : 'light'
  }
}

describe('appearance store mutations', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('does not let older patch responses replace a newer slider value', async () => {
    const initialAppearance: AppearanceSettings = {
      ...structuredClone(DEFAULT_CLIENT_SETTINGS.appearance),
      background: {
        assetId: '31ce027a-f782-4da5-b914-49a20a8b84c2.png',
        blurPx: 24,
        surfaceOpacity: 0.65
      }
    }
    const firstAppearance: AppearanceSettings = {
      ...initialAppearance,
      background: { ...initialAppearance.background!, blurPx: 30 }
    }
    const latestAppearance: AppearanceSettings = {
      ...initialAppearance,
      background: { ...initialAppearance.background!, blurPx: 42 }
    }
    const first = deferred<ClientSettingsSnapshot>()
    const latest = deferred<ClientSettingsSnapshot>()
    let listener: ((state: ClientSettingsState) => void) | undefined
    const api: ClientSettingsBridgeApi = {
      bootstrap: () => ({
        state: { status: 'ready', snapshot: snapshot(initialAppearance) },
        removeLegacyKeys: true
      }),
      get: async () => ({ status: 'ready', snapshot: snapshot(initialAppearance) }),
      patch: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(latest.promise),
      chooseBackground: vi.fn(),
      clearBackground: vi.fn(),
      reset: vi.fn(),
      subscribe: (next) => {
        listener = next
        return () => {
          listener = undefined
        }
      }
    }
    Object.defineProperty(window, 'kowork', {
      configurable: true,
      value: { clientSettings: api }
    })
    const store = await import('../../src/renderer/src/app/appearance/appearance-store')
    store.getAppearanceStoreSnapshot()

    const firstUpdate = store.updateAppearance(firstAppearance)
    const latestUpdate = store.updateAppearance(latestAppearance)
    expect(store.getAppearanceStoreSnapshot().state).toMatchObject({
      status: 'ready',
      snapshot: { appearance: { background: { blurPx: 42 } } }
    })

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    listener?.({ status: 'ready', snapshot: snapshot(firstAppearance) })
    first.resolve(snapshot(firstAppearance))
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2))
    expect(store.getAppearanceStoreSnapshot().state).toMatchObject({
      status: 'ready',
      snapshot: { appearance: { background: { blurPx: 42 } } }
    })

    listener?.({ status: 'ready', snapshot: snapshot(latestAppearance) })
    latest.resolve(snapshot(latestAppearance))
    await Promise.all([firstUpdate, latestUpdate])
    expect(store.getAppearanceStoreSnapshot().state).toMatchObject({
      status: 'ready',
      snapshot: { appearance: { background: { blurPx: 42 } } }
    })
  })
})
