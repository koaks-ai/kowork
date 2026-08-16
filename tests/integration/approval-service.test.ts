import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ApprovalService } from '../../packages/core/src/application/approval-service'
import { CoreEventBus } from '../../packages/core/src/application/event-bus'
import { AppDatabase } from '../../packages/core/src/infrastructure/db/database'

describe('Approval lifecycle', () => {
  it('denies and rejects a pending approval when the run signal is aborted', async () => {
    const dataPath = await mkdtemp(join(tmpdir(), 'kowork-approval-abort-'))
    const projectPath = join(dataPath, 'project')
    await mkdir(projectPath)
    const database = new AppDatabase(join(dataPath, 'kowork.sqlite'))
    const events = new CoreEventBus(database)
    const approvals = new ApprovalService(database, events)
    const project = database.addProject(projectPath, 'project')
    const thread = database.createThread(project.id, 'Approval', 'ollama-qwen3')
    const request = database.enqueueRequest(thread, 'run a command', 32_000)
    const run = database.createRun(request)
    const controller = new AbortController()

    const authorization = approvals.authorizeShell({
      project,
      thread,
      runId: run.id,
      cwd: projectPath,
      command: 'pnpm test',
      signal: controller.signal
    })
    await expect
      .poll(() => database.listApprovals(thread.id, true).length, { timeout: 2_000 })
      .toBe(1)

    controller.abort('Cancelled by user')

    await expect(authorization).rejects.toMatchObject({
      code: 'approval_cancelled',
      message: 'Cancelled by user'
    })
    expect(database.listApprovals(thread.id)[0]?.status).toBe('denied')
    approvals.close()
    database.close()
  })

  it('denies and releases an approval that is waiting during shutdown', async () => {
    const dataPath = await mkdtemp(join(tmpdir(), 'kowork-approval-'))
    const projectPath = join(dataPath, 'project')
    await mkdir(projectPath)
    const database = new AppDatabase(join(dataPath, 'kowork.sqlite'))
    const events = new CoreEventBus(database)
    const approvals = new ApprovalService(database, events)
    const project = database.addProject(projectPath, 'project')
    const thread = database.createThread(project.id, 'Approval', 'ollama-qwen3')
    const request = database.enqueueRequest(thread, 'run a command', 32_000)
    const run = database.createRun(request)

    const authorization = approvals.authorizeShell({
      project,
      thread,
      runId: run.id,
      cwd: projectPath,
      command: 'pnpm test'
    })
    await expect
      .poll(() => database.listApprovals(thread.id, true).length, { timeout: 2_000 })
      .toBe(1)

    approvals.close()

    await expect(authorization).rejects.toMatchObject({ code: 'permission_denied' })
    expect(database.listApprovals(thread.id)[0]?.status).toBe('denied')
    database.close()
  })
})
