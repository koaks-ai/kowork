import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { ConversationTurn } from '@koaks/node'
import { AppDatabase } from '../../packages/core/src/infrastructure/db/database'
import { migrations } from '../../packages/core/src/infrastructure/db/migrations'
import { PersistentThreadMemory } from '../../packages/core/src/infrastructure/koaks/persistent-memory'

function completedTurn(id: string, userText: string, assistantText: string): ConversationTurn {
  return {
    id,
    status: { type: 'completed' },
    items: [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'text', text: userText }]
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: assistantText }]
      }
    ],
    usage: {
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      cachedInputTokens: 0,
      reasoningOutputTokens: 0
    }
  }
}

describe('SQLite persistence', () => {
  it('persists FIFO requests and recovers active runs as interrupted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-db-'))
    const projectRoot = join(root, 'project')
    await mkdir(projectRoot)
    const database = new AppDatabase(join(root, 'kowork.sqlite'))
    const project = database.addProject(projectRoot, 'project')
    const thread = database.createThread(project.id, 'Thread', 'openai-gpt-4.1-mini')
    const first = database.enqueueRequest(thread, 'first', 32_000)
    const second = database.enqueueRequest(thread, 'second', 32_000)
    expect(database.nextQueued(thread.id)?.id).toBe(first.id)
    expect(second.position).toBeGreaterThan(first.position)
    database.updateRequest(first.id, 'running')
    const run = database.createRun(first)
    database.updateRun(run.id, { status: 'running' })
    expect(database.recoverInterruptedRuns()[0]?.id).toBe(run.id)
    expect(database.getRun(run.id).status).toBe('interrupted')
    expect(database.getThread(thread.id).queuePaused).toBe(true)
    database.close()
  })

  it('migrates v1 model profiles to provider-backed profiles without breaking threads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-db-v1-'))
    const path = join(root, 'kowork.sqlite')
    const sqlite = new BetterSqlite3(path)
    sqlite.exec(migrations[0]!.sql)
    sqlite.exec(
      'CREATE TABLE _kowork_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)'
    )
    sqlite.prepare('INSERT INTO _kowork_migrations VALUES (1, ?, ?)').run('initial', Date.now())
    sqlite
      .prepare('INSERT INTO model_profiles VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        'legacy-deepseek',
        'Legacy DeepSeek',
        'deepseek',
        'deepseek-chat',
        'https://api.deepseek.com',
        'LEGACY_KEY',
        128_000
      )
    sqlite
      .prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?, NULL)')
      .run('project-1', 'project', root, Date.now(), Date.now())
    sqlite
      .prepare('INSERT INTO threads VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?, NULL)')
      .run(
        'thread-1',
        'project-1',
        'Legacy thread',
        'legacy-deepseek',
        'ask',
        Date.now(),
        Date.now()
      )
    sqlite.close()

    const database = new AppDatabase(path)
    expect(database.getThread('thread-1').modelProfileId).toBe('legacy-deepseek')
    expect(database.getProfile('legacy-deepseek')).toMatchObject({
      providerId: 'provider-openai-chat',
      model: 'deepseek-chat',
      available: false
    })
    expect(database.getProvider('provider-openai-chat').name).toBe('OpenAI')
    database.close()
  })

  it('migrates v2 queues and approvals to live permissions and read-only legacy grants', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-db-v2-'))
    const path = join(root, 'kowork.sqlite')
    const sqlite = new BetterSqlite3(path)
    sqlite.exec(migrations[0]!.sql)
    sqlite.pragma('foreign_keys = OFF')
    sqlite.exec(migrations[1]!.sql)
    sqlite.pragma('foreign_keys = ON')
    sqlite.exec(
      'CREATE TABLE _kowork_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)'
    )
    sqlite.prepare('INSERT INTO _kowork_migrations VALUES (?, ?, ?)').run(1, 'initial', Date.now())
    sqlite
      .prepare('INSERT INTO _kowork_migrations VALUES (?, ?, ?)')
      .run(2, 'provider_credentials_and_models', Date.now())
    const now = Date.now()
    sqlite
      .prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?, NULL)')
      .run('project-v2', 'project', root, now, now)
    sqlite
      .prepare('INSERT INTO threads VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?, NULL)')
      .run('thread-v2', 'project-v2', 'Thread', 'openai-gpt-4.1-mini', 'auto', now, now)
    sqlite
      .prepare('INSERT INTO turn_requests VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        'request-v2',
        'thread-v2',
        'queued input',
        'queued',
        'openai-gpt-4.1-mini',
        'ask',
        32_000,
        0,
        now,
        now
      )
    sqlite
      .prepare('INSERT INTO approvals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        'approval-v2',
        'project-v2',
        'thread-v2',
        'run-v2',
        'external_path',
        'Legacy path',
        'Legacy detail',
        'allowed',
        root,
        now,
        now
      )
    sqlite
      .prepare('INSERT INTO path_grants VALUES (?, ?, ?, ?)')
      .run('grant-v2', 'run-v2', root, now)
    sqlite.close()

    const database = new AppDatabase(path)
    expect(database.getRequest('request-v2')).toMatchObject({
      input: 'queued input',
      modelProfileId: 'openai-gpt-4.1-mini',
      contextWindowTokens: 32_000
    })
    expect(database.listApprovals('thread-v2')).toEqual([
      expect.objectContaining({ id: 'approval-v2', requestedAccess: null })
    ])
    expect(database.listPathGrants('run-v2')).toEqual([
      { rootPath: root, accessMode: 'read', isDirectory: true }
    ])
    const requestColumns = database.sqlite
      .prepare('PRAGMA table_info(turn_requests)')
      .all()
      .map((column) => (column as { name: string }).name)
    expect(requestColumns).not.toContain('permission_mode')
    database.close()
  })

  it('keeps conversation history when Koaks turn ids restart with the application', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-memory-restart-'))
    const path = join(root, 'kowork.sqlite')
    const projectRoot = join(root, 'project')
    await mkdir(projectRoot)

    const firstDatabase = new AppDatabase(path)
    const project = firstDatabase.addProject(projectRoot, 'project')
    const thread = firstDatabase.createThread(project.id, 'Thread', 'openai-gpt-4.1-mini')
    new PersistentThreadMemory(thread.id, firstDatabase).commit(
      completedTurn('0', 'My name is Lin.', 'I will remember that.')
    )
    firstDatabase.close()

    const reopenedDatabase = new AppDatabase(path)
    const memory = new PersistentThreadMemory(thread.id, reopenedDatabase)
    expect(memory.load().transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'message',
          role: 'user',
          content: [{ type: 'text', text: 'My name is Lin.' }]
        })
      ])
    )

    memory.commit(completedTurn('0', 'What is my name?', 'Your name is Lin.'))

    expect(reopenedDatabase.getConversationTurns(thread.id)).toHaveLength(2)
    expect(memory.load().transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Your name is Lin.' }]
        })
      ])
    )
    reopenedDatabase.close()
  })
})
