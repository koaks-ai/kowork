import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  ClientSettingsError,
  ClientSettingsParseError,
  DEFAULT_CLIENT_SETTINGS,
  clientSettingsPatchSchema,
  clientSettingsSchema,
  layoutSchema,
  legacyLayoutInputSchema,
  parseClientSettings,
  type ClientLayout,
  type ClientLayoutKey,
  type ClientSettings,
  type ClientSettingsBootstrapResponse,
  type ClientSettingsPatch,
  type ClientSettingsSnapshot,
  type ClientSettingsState,
  type ClientSettingsWarning,
  type LegacyLayoutInput,
  type ResolvedColorScheme
} from '@kowork/client-settings'

interface PendingLegacySettings {
  settings: Omit<ClientSettings, 'layout'> & { layout: Partial<ClientLayout> }
  missingKeys: ClientLayoutKey[]
}

type ResolveColorScheme = (
  preference: ClientSettings['appearance']['colorScheme']
) => ResolvedColorScheme

interface ClientSettingsStoreOptions {
  filePath: string
  resolveColorScheme: ResolveColorScheme
  validateBackground?(assetId: string): Promise<void>
}

const LAYOUT_KEYS = [
  'leftSidebarWidth',
  'rightSidebarWidth',
  'settingsProviderListWidth'
] as const satisfies readonly ClientLayoutKey[]

function cloneDefaults(): ClientSettings {
  return structuredClone(DEFAULT_CLIENT_SETTINGS)
}

function snapshot(
  settings: ClientSettings,
  resolveColorScheme: ResolveColorScheme
): ClientSettingsSnapshot {
  return {
    ...structuredClone(settings),
    resolvedColorScheme: resolveColorScheme(settings.appearance.colorScheme)
  }
}

function invalidSettingsError(error: unknown): ClientSettingsError {
  if (error instanceof ClientSettingsError) return error
  return new ClientSettingsError(
    { code: 'CLIENT_SETTINGS_INVALID', message: '客户端设置格式无效' },
    { cause: error }
  )
}

function parsePendingLegacySettings(input: unknown): PendingLegacySettings | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const rootKeys = Object.keys(record).sort()
  if (rootKeys.some((key) => !['appearance', 'layout', 'locale', 'version'].includes(key)))
    return null
  if (
    !Object.hasOwn(record, 'version') ||
    !Object.hasOwn(record, 'appearance') ||
    !Object.hasOwn(record, 'locale')
  )
    return null
  const rawLayout = record.layout
  if (
    rawLayout !== undefined &&
    (!rawLayout || typeof rawLayout !== 'object' || Array.isArray(rawLayout))
  )
    return null
  const layoutRecord = (rawLayout ?? {}) as Record<string, unknown>
  if (Object.keys(layoutRecord).some((key) => !LAYOUT_KEYS.includes(key as ClientLayoutKey)))
    return null

  const missingKeys = LAYOUT_KEYS.filter((key) => !Object.hasOwn(layoutRecord, key))
  if (missingKeys.length === 0) return null
  const candidate = {
    ...record,
    layout: { ...DEFAULT_CLIENT_SETTINGS.layout, ...layoutRecord }
  }
  const parsed = clientSettingsSchema.safeParse(candidate)
  if (!parsed.success) return null
  return {
    settings: { ...parsed.data, layout: { ...layoutRecord } },
    missingKeys: [...missingKeys]
  }
}

function parseLegacyWidth(
  key: ClientLayoutKey,
  value: unknown
): { value: number; warning?: ClientSettingsWarning } {
  if (value === undefined || value === null || value === '') {
    return { value: DEFAULT_CLIENT_SETTINGS.layout[key] }
  }
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  const candidate = { ...DEFAULT_CLIENT_SETTINGS.layout, [key]: numeric }
  const parsed = layoutSchema.safeParse(candidate)
  if (parsed.success) return { value: parsed.data[key] }
  return {
    value: DEFAULT_CLIENT_SETTINGS.layout[key],
    warning: {
      code: 'LEGACY_LAYOUT_INVALID',
      key,
      reason: 'invalid',
      defaultValue: DEFAULT_CLIENT_SETTINGS.layout[key]
    }
  }
}

export class ClientSettingsStore {
  private state: ClientSettingsState = {
    status: 'error',
    error: { code: 'CLIENT_SETTINGS_IO', message: '客户端设置尚未加载' }
  }
  private pendingLegacy: PendingLegacySettings | null = null
  private newFilePending = false
  private tail: Promise<void> = Promise.resolve()
  private readonly listeners = new Set<(state: ClientSettingsState) => void>()

  constructor(private readonly options: ClientSettingsStoreOptions) {}

  async initialize(): Promise<void> {
    let raw: string
    try {
      raw = await readFile(this.options.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.newFilePending = true
        this.setReady(cloneDefaults())
        return
      }
      this.setError(
        new ClientSettingsError(
          { code: 'CLIENT_SETTINGS_IO', message: '读取客户端设置失败' },
          { cause: error }
        )
      )
      return
    }

    try {
      const decoded: unknown = JSON.parse(raw)
      const legacy = parsePendingLegacySettings(decoded)
      if (legacy) {
        this.pendingLegacy = legacy
        this.setReady({
          ...legacy.settings,
          layout: { ...DEFAULT_CLIENT_SETTINGS.layout, ...legacy.settings.layout }
        } as ClientSettings)
        return
      }
      const settings = parseClientSettings(decoded)
      if (settings.appearance.background && this.options.validateBackground) {
        try {
          await this.options.validateBackground(settings.appearance.background.assetId)
        } catch {
          const cleared = {
            ...settings,
            appearance: { ...settings.appearance, background: null }
          }
          await this.writeAtomic(cleared)
          this.setReady(cleared, [{ code: 'BACKGROUND_CLEARED', reason: 'missing-or-invalid' }])
          return
        }
      }
      this.setReady(settings)
    } catch (error) {
      this.setError(invalidSettingsError(error))
    }
  }

  bootstrapLegacy(input: LegacyLayoutInput): ClientSettingsBootstrapResponse {
    const parsedInput = legacyLayoutInputSchema.parse(input)
    if (this.state.status !== 'ready') return { state: this.getState(), removeLegacyKeys: false }
    if (!this.newFilePending && !this.pendingLegacy) {
      return { state: this.getState(), removeLegacyKeys: true }
    }

    const missingKeys = this.pendingLegacy?.missingKeys ?? [...LAYOUT_KEYS]
    const warnings: ClientSettingsWarning[] = []
    const migratedLayout = { ...this.state.snapshot.layout }
    for (const key of missingKeys) {
      const migrated = parseLegacyWidth(key, parsedInput[key])
      migratedLayout[key] = migrated.value
      if (migrated.warning) warnings.push(migrated.warning)
    }
    const migrated: ClientSettings = {
      version: this.state.snapshot.version,
      appearance: this.state.snapshot.appearance,
      layout: migratedLayout,
      locale: this.state.snapshot.locale
    }
    try {
      this.writeAtomicSync(migrated)
    } catch (error) {
      this.setError(
        new ClientSettingsError(
          { code: 'CLIENT_SETTINGS_IO', message: '迁移旧布局设置失败' },
          { cause: error }
        )
      )
      return { state: this.getState(), removeLegacyKeys: false }
    }
    this.pendingLegacy = null
    this.newFilePending = false
    this.setReady(migrated, warnings)
    return { state: this.getState(), removeLegacyKeys: true }
  }

  getState(): ClientSettingsState {
    return structuredClone(this.state)
  }

  getSnapshot(): ClientSettingsSnapshot {
    if (this.state.status !== 'ready') throw new ClientSettingsError(this.state.error)
    return structuredClone(this.state.snapshot)
  }

  subscribe(listener: (state: ClientSettingsState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async patch(rawPatch: ClientSettingsPatch): Promise<ClientSettingsSnapshot> {
    const parsedPatch = clientSettingsPatchSchema.safeParse(rawPatch)
    if (!parsedPatch.success) {
      throw new ClientSettingsParseError(
        parsedPatch.error.issues.map((issue) => ({
          path: issue.path.join('.') || '$',
          message: issue.message
        }))
      )
    }
    const patch = parsedPatch.data
    return await this.enqueue(async () => {
      const current = this.getSnapshot()
      const next = parseClientSettings({
        version: current.version,
        appearance: patch.section === 'appearance' ? patch.value : current.appearance,
        layout: patch.section === 'layout' ? patch.value : current.layout,
        locale: patch.section === 'locale' ? patch.value : current.locale
      })
      await this.writeAtomic(next)
      this.setReady(next)
      return this.getSnapshot()
    })
  }

  async reset(): Promise<ClientSettingsSnapshot> {
    return await this.enqueue(async () => {
      const next = cloneDefaults()
      await this.writeAtomic(next)
      this.pendingLegacy = null
      this.newFilePending = false
      this.setReady(next)
      return this.getSnapshot()
    })
  }

  async clearInvalidBackground(assetId: string): Promise<ClientSettingsSnapshot | null> {
    return await this.enqueue(async () => {
      const current = this.getSnapshot()
      if (current.appearance.background?.assetId !== assetId) return null
      const next = parseClientSettings({
        version: current.version,
        appearance: { ...current.appearance, background: null },
        layout: current.layout,
        locale: current.locale
      })
      await this.writeAtomic(next)
      this.setReady(next, [{ code: 'BACKGROUND_CLEARED', reason: 'missing-or-invalid' }])
      return this.getSnapshot()
    })
  }

  refreshResolvedColorScheme(): void {
    if (this.state.status !== 'ready') return
    const next = snapshot(this.state.snapshot, this.options.resolveColorScheme)
    if (next.resolvedColorScheme === this.state.snapshot.resolvedColorScheme) return
    this.state = { ...this.state, snapshot: next }
    this.emit()
  }

  addWarning(warning: ClientSettingsWarning): void {
    if (this.state.status !== 'ready') return
    const warnings = [...(this.state.warnings ?? []), warning]
    this.state = { ...this.state, warnings }
    this.emit()
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation)
    this.tail = run.then(
      () => undefined,
      () => undefined
    )
    return await run
  }

  private async writeAtomic(settings: ClientSettings): Promise<void> {
    await mkdir(dirname(this.options.filePath), { recursive: true })
    const temporary = `${this.options.filePath}.${crypto.randomUUID()}.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600
      })
      await rename(temporary, this.options.filePath)
    } catch (error) {
      let cause = error
      try {
        await unlink(temporary)
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
          cause = new AggregateError([error, cleanupError], '写入失败且临时文件清理失败')
        }
      }
      throw new ClientSettingsError(
        { code: 'CLIENT_SETTINGS_IO', message: '写入客户端设置失败' },
        { cause }
      )
    }
  }

  private writeAtomicSync(settings: ClientSettings): void {
    mkdirSync(dirname(this.options.filePath), { recursive: true })
    const temporary = `${this.options.filePath}.${crypto.randomUUID()}.tmp`
    try {
      writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600
      })
      renameSync(temporary, this.options.filePath)
    } catch (error) {
      let cause = error
      try {
        unlinkSync(temporary)
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
          cause = new AggregateError([error, cleanupError], '迁移失败且临时文件清理失败')
        }
      }
      throw new ClientSettingsError(
        { code: 'CLIENT_SETTINGS_IO', message: '写入客户端设置失败' },
        { cause }
      )
    }
  }

  private setReady(settings: ClientSettings, warnings?: ClientSettingsWarning[]): void {
    this.state = {
      status: 'ready',
      snapshot: snapshot(settings, this.options.resolveColorScheme),
      ...(warnings?.length ? { warnings } : {})
    }
    this.emit()
  }

  private setError(error: ClientSettingsError): void {
    this.state = { status: 'error', error: error.toDto() }
    this.emit()
  }

  private emit(): void {
    const state = this.getState()
    this.listeners.forEach((listener) => listener(state))
  }
}
