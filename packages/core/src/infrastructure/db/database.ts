import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { and, asc, desc, eq, gt, isNull, or, sql, type SQL } from 'drizzle-orm'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type {
  ApprovalDto,
  AppSettingsDto,
  ModelSource,
  ModelProfileDto,
  PermissionMode,
  ProjectDto,
  ProviderDto,
  ProviderKind,
  ProviderProtocol,
  QueuedRequestDto,
  RunDto,
  RunEventDto,
  RunEventType,
  ThreadDto
} from '@kowork/contracts'
import { appSettingsSchema } from '@kowork/contracts'
import { createId } from '../../domain/ids'
import { CoreError } from '../../domain/errors'
import { migrations } from './migrations'
import * as schema from './schema'

type DatabaseClient = BetterSQLite3Database<typeof schema>

function asProject(row: typeof schema.projects.$inferSelect): ProjectDto {
  return { ...row, deletedAt: row.deletedAt ?? null }
}

function asThread(row: typeof schema.threads.$inferSelect): ThreadDto {
  return {
    ...row,
    permissionMode: row.permissionMode as PermissionMode,
    contextWindowTokens: row.contextWindowTokens ?? null,
    deletedAt: row.deletedAt ?? null
  }
}

function asRequest(row: typeof schema.turnRequests.$inferSelect): QueuedRequestDto {
  return {
    ...row,
    status: row.status as QueuedRequestDto['status'],
    permissionMode: row.permissionMode as PermissionMode
  }
}

function asRun(row: typeof schema.runs.$inferSelect): RunDto {
  return {
    ...row,
    status: row.status as RunDto['status'],
    finishedAt: row.finishedAt ?? null,
    error: row.error ?? null
  }
}

function asApproval(row: typeof schema.approvals.$inferSelect): ApprovalDto {
  return {
    ...row,
    kind: row.kind as ApprovalDto['kind'],
    status: row.status as ApprovalDto['status'],
    requestedPath: row.requestedPath ?? null,
    resolvedAt: row.resolvedAt ?? null
  }
}

function asProvider(row: typeof schema.providers.$inferSelect): ProviderDto {
  const kind = row.kind as ProviderKind
  return {
    id: row.id,
    name: row.name,
    kind,
    protocol: row.protocol as ProviderProtocol,
    baseUrl: row.baseUrl,
    credentialConfigured: row.credentialId !== null,
    enabled: row.enabled,
    available: row.enabled && (kind === 'ollama' || row.credentialId !== null),
    defaultContextWindowTokens: row.defaultContextWindowTokens,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function asProfile(
  row: typeof schema.modelProfiles.$inferSelect,
  provider: typeof schema.providers.$inferSelect
): ModelProfileDto {
  const providerAvailable =
    provider.enabled &&
    provider.deletedAt === null &&
    (provider.kind === 'ollama' || provider.credentialId !== null)
  return {
    id: row.id,
    providerId: row.providerId,
    name: row.name,
    model: row.model,
    contextWindowTokens: row.contextWindowTokens,
    source: row.source as ModelSource,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    available: row.enabled && providerAvailable
  }
}

export class AppDatabase {
  readonly sqlite: BetterSqlite3.Database
  readonly db: DatabaseClient

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.sqlite = new BetterSqlite3(path)
    this.sqlite.pragma('journal_mode = WAL')
    this.sqlite.pragma('foreign_keys = ON')
    this.db = drizzle(this.sqlite, { schema })
    this.migrate()
  }

  private migrate(): void {
    this.sqlite.exec(
      'CREATE TABLE IF NOT EXISTS _kowork_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)'
    )
    const applied = new Set(
      this.sqlite
        .prepare('SELECT id FROM _kowork_migrations')
        .all()
        .map((row) => (row as { id: number }).id)
    )
    for (const migration of migrations) {
      if (applied.has(migration.id)) continue
      if (migration.disableForeignKeys) this.sqlite.pragma('foreign_keys = OFF')
      try {
        this.sqlite.transaction(() => {
          this.sqlite.exec(migration.sql)
          this.sqlite
            .prepare('INSERT INTO _kowork_migrations (id, name, applied_at) VALUES (?, ?, ?)')
            .run(migration.id, migration.name, Date.now())
        })()
      } finally {
        if (migration.disableForeignKeys) this.sqlite.pragma('foreign_keys = ON')
      }
      const violations = this.sqlite.pragma('foreign_key_check') as unknown[]
      if (violations.length > 0) {
        throw new Error(`Migration ${migration.id} left foreign key violations`)
      }
    }
  }

  close(): void {
    this.sqlite.close()
  }

  listProviders(includeDeleted = false): ProviderDto[] {
    const rows = includeDeleted
      ? this.db.select().from(schema.providers).orderBy(asc(schema.providers.name)).all()
      : this.db
          .select()
          .from(schema.providers)
          .where(isNull(schema.providers.deletedAt))
          .orderBy(asc(schema.providers.name))
          .all()
    return rows.map(asProvider)
  }

  getProvider(id: string): ProviderDto {
    const row = this.db.select().from(schema.providers).where(eq(schema.providers.id, id)).get()
    if (!row || row.deletedAt !== null)
      throw new CoreError('provider_not_found', `Provider '${id}' was not found`)
    return asProvider(row)
  }

  createProvider(input: {
    id: string
    name: string
    kind: ProviderKind
    protocol: ProviderProtocol
    baseUrl: string
    credentialId: string | null
    defaultContextWindowTokens: number
  }): ProviderDto {
    const now = Date.now()
    const row = this.db
      .insert(schema.providers)
      .values({ ...input, enabled: true, createdAt: now, updatedAt: now, deletedAt: null })
      .returning()
      .get()
    return asProvider(row)
  }

  updateProvider(
    id: string,
    changes: Partial<
      Pick<
        typeof schema.providers.$inferInsert,
        | 'name'
        | 'kind'
        | 'protocol'
        | 'baseUrl'
        | 'credentialId'
        | 'defaultContextWindowTokens'
        | 'enabled'
        | 'deletedAt'
      >
    >
  ): ProviderDto {
    const row = this.db
      .update(schema.providers)
      .set({ ...changes, updatedAt: Date.now() })
      .where(eq(schema.providers.id, id))
      .returning()
      .get()
    if (!row) throw new CoreError('provider_not_found', `Provider '${id}' was not found`)
    return asProvider(row)
  }

  archiveProvider(id: string): ProviderDto {
    this.getProvider(id)
    const now = Date.now()
    const profileIds = this.db
      .select({ id: schema.modelProfiles.id })
      .from(schema.modelProfiles)
      .where(eq(schema.modelProfiles.providerId, id))
      .all()
      .map((row) => row.id)
    const transaction = this.sqlite.transaction(() => {
      this.db
        .update(schema.modelProfiles)
        .set({ enabled: false, updatedAt: now })
        .where(eq(schema.modelProfiles.providerId, id))
        .run()
      this.db
        .update(schema.providers)
        .set({ enabled: false, credentialId: null, deletedAt: now, updatedAt: now })
        .where(eq(schema.providers.id, id))
        .run()
      const settings = this.getSettings()
      if (settings.defaultModelProfileId && profileIds.includes(settings.defaultModelProfileId)) {
        this.updateSettings({ defaultModelProfileId: null })
      }
    })
    transaction()
    const row = this.db.select().from(schema.providers).where(eq(schema.providers.id, id)).get()!
    return asProvider(row)
  }

  listProfiles(): ModelProfileDto[] {
    return this.db
      .select({ profile: schema.modelProfiles, provider: schema.providers })
      .from(schema.modelProfiles)
      .innerJoin(schema.providers, eq(schema.modelProfiles.providerId, schema.providers.id))
      .where(isNull(schema.providers.deletedAt))
      .orderBy(asc(schema.modelProfiles.name))
      .all()
      .map(({ profile, provider }) => asProfile(profile, provider))
  }

  getProfile(id: string): ModelProfileDto {
    const profile = this.listProfiles().find((item) => item.id === id)
    if (!profile)
      throw new CoreError('model_profile_not_found', `Model profile '${id}' was not found`)
    return profile
  }

  listProviderProfiles(providerId: string): ModelProfileDto[] {
    return this.listProfiles().filter((profile) => profile.providerId === providerId)
  }

  upsertRemoteModels(providerId: string, models: string[]): ModelProfileDto[] {
    const provider = this.getProvider(providerId)
    const now = Date.now()
    const transaction = this.sqlite.transaction(() => {
      for (const model of models) {
        const existing = this.db
          .select()
          .from(schema.modelProfiles)
          .where(
            and(
              eq(schema.modelProfiles.providerId, providerId),
              eq(schema.modelProfiles.model, model)
            )
          )
          .get()
        if (existing) {
          this.db
            .update(schema.modelProfiles)
            .set({ updatedAt: now })
            .where(eq(schema.modelProfiles.id, existing.id))
            .run()
          continue
        }
        this.db
          .insert(schema.modelProfiles)
          .values({
            id: createId('model'),
            providerId,
            name: model,
            model,
            contextWindowTokens: provider.defaultContextWindowTokens,
            source: 'remote',
            enabled: true,
            createdAt: now,
            updatedAt: now
          })
          .run()
      }
    })
    transaction()
    return this.listProviderProfiles(providerId)
  }

  addModel(input: {
    providerId: string
    model: string
    name: string
    contextWindowTokens: number
  }): ModelProfileDto {
    this.getProvider(input.providerId)
    const existing = this.db
      .select()
      .from(schema.modelProfiles)
      .where(
        and(
          eq(schema.modelProfiles.providerId, input.providerId),
          eq(schema.modelProfiles.model, input.model)
        )
      )
      .get()
    const now = Date.now()
    const row = existing
      ? this.db
          .update(schema.modelProfiles)
          .set({
            name: input.name,
            contextWindowTokens: input.contextWindowTokens,
            enabled: true,
            updatedAt: now
          })
          .where(eq(schema.modelProfiles.id, existing.id))
          .returning()
          .get()
      : this.db
          .insert(schema.modelProfiles)
          .values({
            id: createId('model'),
            ...input,
            source: 'manual',
            enabled: true,
            createdAt: now,
            updatedAt: now
          })
          .returning()
          .get()
    return this.getProfile(row.id)
  }

  archiveModel(id: string): ModelProfileDto {
    const current = this.getProfile(id)
    const row = this.db
      .update(schema.modelProfiles)
      .set({ enabled: false, updatedAt: Date.now() })
      .where(eq(schema.modelProfiles.id, id))
      .returning()
      .get()
    if (!row) throw new CoreError('model_profile_not_found', `Model profile '${id}' was not found`)
    const settings = this.getSettings()
    if (settings.defaultModelProfileId === id) this.updateSettings({ defaultModelProfileId: null })
    const providerRow = this.db
      .select()
      .from(schema.providers)
      .where(eq(schema.providers.id, current.providerId))
      .get()!
    return asProfile(row, providerRow)
  }

  listProjects(includeDeleted = false): ProjectDto[] {
    const rows = includeDeleted
      ? this.db.select().from(schema.projects).orderBy(desc(schema.projects.updatedAt)).all()
      : this.db
          .select()
          .from(schema.projects)
          .where(isNull(schema.projects.deletedAt))
          .orderBy(desc(schema.projects.updatedAt))
          .all()
    return rows.map(asProject)
  }

  getProject(id: string): ProjectDto {
    const row = this.db.select().from(schema.projects).where(eq(schema.projects.id, id)).get()
    if (!row) throw new CoreError('project_not_found', `Project '${id}' was not found`)
    return asProject(row)
  }

  addProject(rootPath: string, name: string): ProjectDto {
    const existing = this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.rootPath, rootPath))
      .get()
    if (existing) {
      if (existing.deletedAt !== null) {
        return this.updateProjectDeleted(existing.id, null)
      }
      return asProject(existing)
    }
    const now = Date.now()
    const row = this.db
      .insert(schema.projects)
      .values({
        id: createId('project'),
        rootPath,
        name,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      })
      .returning()
      .get()
    return asProject(row)
  }

  updateProjectDeleted(projectId: string, deletedAt: number | null): ProjectDto {
    const row = this.db
      .update(schema.projects)
      .set({ deletedAt, updatedAt: Date.now() })
      .where(eq(schema.projects.id, projectId))
      .returning()
      .get()
    if (!row) throw new CoreError('project_not_found', `Project '${projectId}' was not found`)
    return asProject(row)
  }

  listThreads(projectId: string, includeDeleted = false): ThreadDto[] {
    const predicate = includeDeleted
      ? eq(schema.threads.projectId, projectId)
      : and(eq(schema.threads.projectId, projectId), isNull(schema.threads.deletedAt))
    return this.db
      .select()
      .from(schema.threads)
      .where(predicate)
      .orderBy(desc(schema.threads.updatedAt))
      .all()
      .map(asThread)
  }

  getThread(id: string): ThreadDto {
    const row = this.db.select().from(schema.threads).where(eq(schema.threads.id, id)).get()
    if (!row) throw new CoreError('thread_not_found', `Thread '${id}' was not found`)
    return asThread(row)
  }

  createThread(
    projectId: string,
    title: string,
    defaultProfileId = 'deepseek-chat',
    defaultPermissionMode: PermissionMode = 'ask'
  ): ThreadDto {
    this.getProject(projectId)
    const now = Date.now()
    const row = this.db
      .insert(schema.threads)
      .values({
        id: createId('thread'),
        projectId,
        title,
        modelProfileId: defaultProfileId,
        permissionMode: defaultPermissionMode,
        contextWindowTokens: null,
        queuePaused: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      })
      .returning()
      .get()
    return asThread(row)
  }

  updateThread(
    id: string,
    changes: Partial<
      Pick<
        ThreadDto,
        | 'title'
        | 'modelProfileId'
        | 'permissionMode'
        | 'contextWindowTokens'
        | 'queuePaused'
        | 'deletedAt'
      >
    >
  ): ThreadDto {
    const row = this.db
      .update(schema.threads)
      .set({ ...changes, updatedAt: Date.now() })
      .where(eq(schema.threads.id, id))
      .returning()
      .get()
    if (!row) throw new CoreError('thread_not_found', `Thread '${id}' was not found`)
    return asThread(row)
  }

  enqueueRequest(thread: ThreadDto, input: string, contextWindowTokens: number): QueuedRequestDto {
    const maxPosition =
      this.db
        .select({ value: sql<number>`coalesce(max(${schema.turnRequests.position}), -1)` })
        .from(schema.turnRequests)
        .where(eq(schema.turnRequests.threadId, thread.id))
        .get()?.value ?? -1
    const now = Date.now()
    const row = this.db
      .insert(schema.turnRequests)
      .values({
        id: createId('request'),
        threadId: thread.id,
        input,
        status: 'queued',
        modelProfileId: thread.modelProfileId,
        permissionMode: thread.permissionMode,
        contextWindowTokens,
        position: maxPosition + 1,
        createdAt: now,
        updatedAt: now
      })
      .returning()
      .get()
    return asRequest(row)
  }

  listQueue(threadId: string): QueuedRequestDto[] {
    return this.db
      .select()
      .from(schema.turnRequests)
      .where(
        and(
          eq(schema.turnRequests.threadId, threadId),
          or(eq(schema.turnRequests.status, 'queued'), eq(schema.turnRequests.status, 'running'))
        )
      )
      .orderBy(asc(schema.turnRequests.position))
      .all()
      .map(asRequest)
  }

  nextQueued(threadId: string): QueuedRequestDto | undefined {
    const row = this.db
      .select()
      .from(schema.turnRequests)
      .where(
        and(eq(schema.turnRequests.threadId, threadId), eq(schema.turnRequests.status, 'queued'))
      )
      .orderBy(asc(schema.turnRequests.position))
      .get()
    return row ? asRequest(row) : undefined
  }

  getRequest(id: string): QueuedRequestDto {
    const row = this.db
      .select()
      .from(schema.turnRequests)
      .where(eq(schema.turnRequests.id, id))
      .get()
    if (!row) throw new CoreError('request_not_found', `Request '${id}' was not found`)
    return asRequest(row)
  }

  updateRequest(id: string, status: QueuedRequestDto['status']): QueuedRequestDto {
    const row = this.db
      .update(schema.turnRequests)
      .set({ status, updatedAt: Date.now() })
      .where(eq(schema.turnRequests.id, id))
      .returning()
      .get()
    if (!row) throw new CoreError('request_not_found', `Request '${id}' was not found`)
    return asRequest(row)
  }

  createRun(request: QueuedRequestDto): RunDto {
    const now = Date.now()
    const row = this.db
      .insert(schema.runs)
      .values({
        id: createId('run'),
        requestId: request.id,
        threadId: request.threadId,
        status: 'starting',
        modelProfileId: request.modelProfileId,
        startedAt: now,
        finishedAt: null,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        error: null
      })
      .returning()
      .get()
    return asRun(row)
  }

  updateRun(
    id: string,
    changes: Partial<Omit<RunDto, 'id' | 'requestId' | 'threadId' | 'modelProfileId' | 'startedAt'>>
  ): RunDto {
    const row = this.db
      .update(schema.runs)
      .set(changes)
      .where(eq(schema.runs.id, id))
      .returning()
      .get()
    if (!row) throw new CoreError('run_not_found', `Run '${id}' was not found`)
    return asRun(row)
  }

  getRun(id: string): RunDto {
    const row = this.db.select().from(schema.runs).where(eq(schema.runs.id, id)).get()
    if (!row) throw new CoreError('run_not_found', `Run '${id}' was not found`)
    return asRun(row)
  }

  listRuns(threadId: string): RunDto[] {
    return this.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.threadId, threadId))
      .orderBy(asc(schema.runs.startedAt))
      .all()
      .map(asRun)
  }

  listActiveRuns(): RunDto[] {
    return this.db
      .select()
      .from(schema.runs)
      .where(
        or(
          eq(schema.runs.status, 'starting'),
          eq(schema.runs.status, 'running'),
          eq(schema.runs.status, 'waiting')
        )
      )
      .all()
      .map(asRun)
  }

  recoverInterruptedRuns(): RunDto[] {
    const active = this.listActiveRuns()
    const now = Date.now()
    const transaction = this.sqlite.transaction(() => {
      for (const run of active) {
        this.db
          .update(schema.runs)
          .set({ status: 'interrupted', finishedAt: now, error: 'Core process restarted' })
          .where(eq(schema.runs.id, run.id))
          .run()
        this.db
          .update(schema.turnRequests)
          .set({ status: 'interrupted', updatedAt: now })
          .where(eq(schema.turnRequests.id, run.requestId))
          .run()
        this.db
          .update(schema.threads)
          .set({ queuePaused: true, updatedAt: now })
          .where(eq(schema.threads.id, run.threadId))
          .run()
      }
      this.db
        .update(schema.approvals)
        .set({ status: 'denied', resolvedAt: now })
        .where(eq(schema.approvals.status, 'pending'))
        .run()
    })
    transaction()
    return active.map((run) => ({
      ...run,
      status: 'interrupted',
      finishedAt: now,
      error: 'Core process restarted'
    }))
  }

  addEvent(input: {
    projectId?: string | null
    threadId?: string | null
    runId?: string | null
    type: RunEventType
    payload?: Record<string, unknown>
  }): RunEventDto {
    const row = this.db
      .insert(schema.runEvents)
      .values({
        id: createId('event'),
        projectId: input.projectId ?? null,
        threadId: input.threadId ?? null,
        runId: input.runId ?? null,
        type: input.type,
        payloadJson: JSON.stringify(input.payload ?? {}),
        createdAt: Date.now()
      })
      .returning()
      .get()
    return {
      sequence: row.sequence,
      id: row.id,
      projectId: row.projectId ?? null,
      threadId: row.threadId ?? null,
      runId: row.runId ?? null,
      type: row.type as RunEventType,
      payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
      createdAt: row.createdAt
    }
  }

  listEvents(threadId?: string, afterSequence = 0): RunEventDto[] {
    const predicate = threadId
      ? and(eq(schema.runEvents.threadId, threadId), gt(schema.runEvents.sequence, afterSequence))
      : gt(schema.runEvents.sequence, afterSequence)
    return this.db
      .select()
      .from(schema.runEvents)
      .where(predicate)
      .orderBy(asc(schema.runEvents.sequence))
      .all()
      .map((row) => ({
        sequence: row.sequence,
        id: row.id,
        projectId: row.projectId ?? null,
        threadId: row.threadId ?? null,
        runId: row.runId ?? null,
        type: row.type as RunEventType,
        payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
        createdAt: row.createdAt
      }))
  }

  lastEventSequence(): number {
    return (
      this.db
        .select({ value: sql<number>`coalesce(max(${schema.runEvents.sequence}), 0)` })
        .from(schema.runEvents)
        .get()?.value ?? 0
    )
  }

  createApproval(
    input: Omit<ApprovalDto, 'id' | 'status' | 'createdAt' | 'resolvedAt'>
  ): ApprovalDto {
    const row = this.db
      .insert(schema.approvals)
      .values({
        ...input,
        id: createId('approval'),
        status: 'pending',
        createdAt: Date.now(),
        resolvedAt: null
      })
      .returning()
      .get()
    return asApproval(row)
  }

  resolveApproval(id: string, decision: 'allow' | 'deny'): ApprovalDto {
    const row = this.db
      .update(schema.approvals)
      .set({ status: decision === 'allow' ? 'allowed' : 'denied', resolvedAt: Date.now() })
      .where(and(eq(schema.approvals.id, id), eq(schema.approvals.status, 'pending')))
      .returning()
      .get()
    if (!row) throw new CoreError('approval_not_pending', `Approval '${id}' is not pending`)
    return asApproval(row)
  }

  listApprovals(threadId?: string, pendingOnly = false): ApprovalDto[] {
    const conditions: SQL[] = []
    if (threadId) conditions.push(eq(schema.approvals.threadId, threadId))
    if (pendingOnly) conditions.push(eq(schema.approvals.status, 'pending'))
    const query = this.db.select().from(schema.approvals)
    const rows =
      conditions.length === 0
        ? query.orderBy(desc(schema.approvals.createdAt)).all()
        : query
            .where(and(...conditions))
            .orderBy(desc(schema.approvals.createdAt))
            .all()
    return rows.map(asApproval)
  }

  getSettings(): AppSettingsDto {
    const values = Object.fromEntries(
      this.db
        .select()
        .from(schema.appSettings)
        .all()
        .map((row) => [row.key, JSON.parse(row.valueJson) as unknown])
    )
    return appSettingsSchema.parse({
      defaultModelProfileId: values.defaultModelProfileId ?? null,
      defaultPermissionMode: values.defaultPermissionMode ?? 'ask'
    })
  }

  updateSettings(changes: Partial<AppSettingsDto>): AppSettingsDto {
    const next = appSettingsSchema.parse({ ...this.getSettings(), ...changes })
    const update = this.sqlite.transaction(() => {
      for (const [key, value] of Object.entries(next)) {
        this.db
          .insert(schema.appSettings)
          .values({ key, valueJson: JSON.stringify(value), updatedAt: Date.now() })
          .onConflictDoUpdate({
            target: schema.appSettings.key,
            set: { valueJson: JSON.stringify(value), updatedAt: Date.now() }
          })
          .run()
      }
    })
    update()
    return next
  }

  addPathGrant(runId: string, rootPath: string): void {
    this.db
      .insert(schema.pathGrants)
      .values({ id: createId('grant'), runId, rootPath, createdAt: Date.now() })
      .run()
  }

  listPathGrants(runId: string): string[] {
    return this.db
      .select()
      .from(schema.pathGrants)
      .where(eq(schema.pathGrants.runId, runId))
      .all()
      .map((row) => row.rootPath)
  }

  getConversationTurns(threadId: string): Array<typeof schema.conversationTurns.$inferSelect> {
    return this.db
      .select()
      .from(schema.conversationTurns)
      .where(eq(schema.conversationTurns.threadId, threadId))
      .orderBy(asc(schema.conversationTurns.ordinal))
      .all()
  }

  commitConversationTurn(
    input: Omit<typeof schema.conversationTurns.$inferInsert, 'id' | 'ordinal' | 'createdAt'>
  ): void {
    const ordinal =
      (this.db
        .select({ value: sql<number>`coalesce(max(${schema.conversationTurns.ordinal}), 0)` })
        .from(schema.conversationTurns)
        .where(eq(schema.conversationTurns.threadId, input.threadId))
        .get()?.value ?? 0) + 1
    this.db
      .insert(schema.conversationTurns)
      .values({ id: createId('turn'), ...input, ordinal, createdAt: Date.now() })
      .run()
  }

  latestCompression(
    threadId: string
  ): typeof schema.compressionCheckpoints.$inferSelect | undefined {
    return this.db
      .select()
      .from(schema.compressionCheckpoints)
      .where(eq(schema.compressionCheckpoints.threadId, threadId))
      .orderBy(desc(schema.compressionCheckpoints.createdAt))
      .get()
  }

  addCompression(
    input: Omit<typeof schema.compressionCheckpoints.$inferInsert, 'id' | 'createdAt'>
  ): void {
    this.db
      .insert(schema.compressionCheckpoints)
      .values({ ...input, id: createId('compression'), createdAt: Date.now() })
      .run()
  }
}
