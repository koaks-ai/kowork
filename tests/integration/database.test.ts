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
    const thread = database.createThread(project.id, 'Thread', 'ollama-qwen3')
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
      providerId: 'provider-deepseek',
      model: 'deepseek-chat',
      available: false
    })
    expect(database.getProvider('provider-deepseek').credentialConfigured).toBe(false)
    database.close()
  })

  it('keeps conversation history when Koaks turn ids restart with the application', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-memory-restart-'))
    const path = join(root, 'kowork.sqlite')
    const projectRoot = join(root, 'project')
    await mkdir(projectRoot)

    const firstDatabase = new AppDatabase(path)
    const project = firstDatabase.addProject(projectRoot, 'project')
    const thread = firstDatabase.createThread(project.id, 'Thread', 'ollama-qwen3')
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
