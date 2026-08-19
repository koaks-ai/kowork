import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CLIENT_SETTINGS,
  ClientSettingsParseError,
  clientSettingsPatchSchema,
  parseClientSettings
} from '@kowork/client-settings'
import { ClientSettingsStore } from '../../src/main/client-settings/store'

describe('client settings contract', () => {
  it('parses the frozen default settings', () => {
    expect(parseClientSettings(DEFAULT_CLIENT_SETTINGS)).toEqual(DEFAULT_CLIENT_SETTINGS)
  })

  it.each([
    [{ ...DEFAULT_CLIENT_SETTINGS, version: 2 }],
    [{ ...DEFAULT_CLIENT_SETTINGS, unknown: true }],
    [
      {
        ...DEFAULT_CLIENT_SETTINGS,
        appearance: {
          ...DEFAULT_CLIENT_SETTINGS.appearance,
          accent: { type: 'custom', hex: '#ABCDEF' }
        }
      }
    ],
    [
      {
        ...DEFAULT_CLIENT_SETTINGS,
        appearance: {
          ...DEFAULT_CLIENT_SETTINGS.appearance,
          background: {
            assetId: '31ce027a-f782-4da5-b914-49a20a8b84c2.png',
            blurPx: 65,
            surfaceOpacity: 0.78
          }
        }
      }
    ],
    [
      {
        ...DEFAULT_CLIENT_SETTINGS,
        appearance: { ...DEFAULT_CLIENT_SETTINGS.appearance, extra: true }
      }
    ]
  ])('rejects an invalid or non-strict snapshot', (value) => {
    expect(() => parseClientSettings(value)).toThrow(ClientSettingsParseError)
  })

  it('uses complete section replacement patches', () => {
    expect(() =>
      clientSettingsPatchSchema.parse({ section: 'layout', value: { leftSidebarWidth: 300 } })
    ).toThrow()
    expect(
      clientSettingsPatchSchema.parse({
        section: 'layout',
        value: { leftSidebarWidth: 300, rightSidebarWidth: 400, settingsProviderListWidth: 220 }
      })
    ).toBeTruthy()
  })
})

describe('ClientSettingsStore', () => {
  it('migrates only the three known legacy widths and persists the result', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kowork-client-settings-'))
    const filePath = join(directory, 'client-settings.json')
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        appearance: DEFAULT_CLIENT_SETTINGS.appearance,
        layout: {},
        locale: 'zh-CN'
      })
    )
    const store = new ClientSettingsStore({ filePath, resolveColorScheme: () => 'light' })
    await store.initialize()
    const response = store.bootstrapLegacy({
      leftSidebarWidth: '300',
      rightSidebarWidth: 'invalid',
      settingsProviderListWidth: '240'
    })
    expect(response.removeLegacyKeys).toBe(true)
    expect(response.state).toMatchObject({
      status: 'ready',
      snapshot: {
        layout: { leftSidebarWidth: 300, rightSidebarWidth: 332, settingsProviderListWidth: 240 }
      }
    })
    expect(response.state.status === 'ready' ? response.state.warnings : []).toEqual([
      {
        code: 'LEGACY_LAYOUT_INVALID',
        key: 'rightSidebarWidth',
        reason: 'invalid',
        defaultValue: 332
      }
    ])
    expect(JSON.parse(await readFile(filePath, 'utf8')).layout).toEqual({
      leftSidebarWidth: 300,
      rightSidebarWidth: 332,
      settingsProviderListWidth: 240
    })
  })

  it('keeps legacy keys when the migration cannot be written atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kowork-client-settings-migration-failure-'))
    const filePath = join(directory, 'client-settings.json')
    const store = new ClientSettingsStore({ filePath, resolveColorScheme: () => 'light' })
    await store.initialize()
    await rm(directory, { recursive: true })
    await writeFile(directory, 'not a directory')

    const response = store.bootstrapLegacy({ leftSidebarWidth: '300' })

    expect(response.removeLegacyKeys).toBe(false)
    expect(response.state).toMatchObject({
      status: 'error',
      error: { code: 'CLIENT_SETTINGS_IO', message: '迁移旧布局设置失败' }
    })
  })

  it('does not overwrite a damaged settings file and can reset explicitly', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kowork-client-settings-invalid-'))
    const filePath = join(directory, 'client-settings.json')
    await writeFile(filePath, '{ damaged')
    const store = new ClientSettingsStore({ filePath, resolveColorScheme: () => 'light' })
    await store.initialize()
    expect(store.getState().status).toBe('error')
    await expect(readFile(filePath, 'utf8')).resolves.toBe('{ damaged')
    await expect(store.reset()).resolves.toMatchObject({ version: 1, resolvedColorScheme: 'light' })
    expect(parseClientSettings(JSON.parse(await readFile(filePath, 'utf8')))).toEqual(
      DEFAULT_CLIENT_SETTINGS
    )
  })

  it('serializes concurrent section patches without losing updates', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kowork-client-settings-queue-'))
    const filePath = join(directory, 'client-settings.json')
    const store = new ClientSettingsStore({ filePath, resolveColorScheme: () => 'dark' })
    await store.initialize()
    store.bootstrapLegacy({})
    await Promise.all([
      store.patch({
        section: 'appearance',
        value: { ...DEFAULT_CLIENT_SETTINGS.appearance, colorScheme: 'dark' }
      }),
      store.patch({
        section: 'layout',
        value: { ...DEFAULT_CLIENT_SETTINGS.layout, leftSidebarWidth: 320 }
      })
    ])
    expect(store.getSnapshot()).toMatchObject({
      appearance: { colorScheme: 'dark' },
      layout: { leftSidebarWidth: 320 }
    })
  })

  it('reports invalid patches as client-settings validation errors', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kowork-client-settings-invalid-patch-'))
    const store = new ClientSettingsStore({
      filePath: join(directory, 'client-settings.json'),
      resolveColorScheme: () => 'light'
    })
    await store.initialize()
    store.bootstrapLegacy({})

    await expect(
      store.patch({ section: 'layout', value: { leftSidebarWidth: 300 } } as never)
    ).rejects.toMatchObject({ code: 'CLIENT_SETTINGS_INVALID', path: 'value.rightSidebarWidth' })
  })

  it('clears only a missing background while preserving the remaining settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kowork-client-settings-background-'))
    const filePath = join(directory, 'client-settings.json')
    await writeFile(
      filePath,
      JSON.stringify({
        ...DEFAULT_CLIENT_SETTINGS,
        appearance: {
          colorScheme: 'dark',
          accent: { type: 'preset', id: 'violet' },
          background: {
            assetId: '31ce027a-f782-4da5-b914-49a20a8b84c2.png',
            blurPx: 16,
            surfaceOpacity: 0.65
          }
        },
        layout: { ...DEFAULT_CLIENT_SETTINGS.layout, leftSidebarWidth: 320 }
      })
    )
    const store = new ClientSettingsStore({
      filePath,
      resolveColorScheme: () => 'dark',
      validateBackground: async () => {
        throw new Error('missing')
      }
    })

    await store.initialize()

    expect(store.getState()).toMatchObject({
      status: 'ready',
      snapshot: {
        appearance: {
          colorScheme: 'dark',
          accent: { type: 'preset', id: 'violet' },
          background: null
        },
        layout: { leftSidebarWidth: 320 }
      },
      warnings: [{ code: 'BACKGROUND_CLEARED', reason: 'missing-or-invalid' }]
    })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      appearance: { colorScheme: 'dark', background: null },
      layout: { leftSidebarWidth: 320 }
    })
  })

  it('conditionally clears a background that becomes invalid at runtime', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kowork-client-settings-runtime-background-'))
    const filePath = join(directory, 'client-settings.json')
    const currentAssetId = '31ce027a-f782-4da5-b914-49a20a8b84c2.png'
    const store = new ClientSettingsStore({ filePath, resolveColorScheme: () => 'dark' })
    await store.initialize()
    store.bootstrapLegacy({})
    await store.patch({
      section: 'appearance',
      value: {
        colorScheme: 'dark',
        accent: { type: 'preset', id: 'violet' },
        background: { assetId: currentAssetId, blurPx: 16, surfaceOpacity: 0.65 }
      }
    })

    await expect(
      store.clearInvalidBackground('67a0ef4a-991c-4ddb-9fc2-3f36f6de05d4.jpeg')
    ).resolves.toBeNull()
    await expect(store.clearInvalidBackground(currentAssetId)).resolves.toMatchObject({
      appearance: {
        colorScheme: 'dark',
        accent: { type: 'preset', id: 'violet' },
        background: null
      }
    })
    expect(store.getState()).toMatchObject({
      status: 'ready',
      warnings: [{ code: 'BACKGROUND_CLEARED', reason: 'missing-or-invalid' }]
    })
  })
})
