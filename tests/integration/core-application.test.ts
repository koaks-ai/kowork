import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CoreApplication } from '@kowork/core'
import type { RunEventDto } from '@kowork/contracts'

describe('Core application', () => {
  it('runs a persisted fake-agent request end to end', async () => {
    const dataPath = await mkdtemp(join(tmpdir(), 'kowork-core-'))
    const projectPath = join(dataPath, 'project')
    await mkdir(projectPath)
    const core = new CoreApplication(dataPath, undefined, true)
    const events: RunEventDto[] = []
    core.subscribe((event) => events.push(event))
    const project = await core.handle('projects.add', { rootPath: projectPath })
    const thread = await core.handle('threads.create', { projectId: project.id, title: 'Test' })
    await core.handle('runs.enqueue', { threadId: thread.id, input: 'Inspect this project' })
    await expect
      .poll(() => events.some((event) => event.type === 'run.completed'), { timeout: 4_000 })
      .toBe(true)
    const persisted = await core.handle('events.list', { threadId: thread.id })
    expect(persisted.some((event) => event.type === 'run.text')).toBe(true)
    expect((await core.handle('runs.list', { threadId: thread.id }))[0]?.status).toBe('completed')
    await core.close()
  })

  it('cancels an active run and pauses its thread queue', async () => {
    const dataPath = await mkdtemp(join(tmpdir(), 'kowork-cancel-'))
    const projectPath = join(dataPath, 'project')
    await mkdir(projectPath)
    const core = new CoreApplication(dataPath, undefined, true)
    const events: RunEventDto[] = []
    core.subscribe((event) => events.push(event))
    const project = await core.handle('projects.add', { rootPath: projectPath })
    const thread = await core.handle('threads.create', { projectId: project.id, title: 'Cancel' })
    await core.handle('runs.enqueue', { threadId: thread.id, input: 'x'.repeat(2_000) })
    await expect
      .poll(async () => (await core.handle('runs.list', { threadId: thread.id }))[0]?.status)
      .toBe('running')
    const run = (await core.handle('runs.list', { threadId: thread.id }))[0]
    expect(run).toBeDefined()
    await core.handle('runs.cancel', { runId: run!.id })
    await expect
      .poll(() => events.some((event) => event.type === 'run.cancelled'), { timeout: 4_000 })
      .toBe(true)
    expect((await core.handle('runs.list', { threadId: thread.id }))[0]?.status).toBe('cancelled')
    expect((await core.handle('threads.list', { projectId: project.id }))[0]?.queuePaused).toBe(
      true
    )
    await core.close()
  })

  it('persists defaults and applies them to new threads', async () => {
    const dataPath = await mkdtemp(join(tmpdir(), 'kowork-settings-'))
    const projectPath = join(dataPath, 'project')
    await mkdir(projectPath)
    const core = new CoreApplication(dataPath, undefined, true)
    const project = await core.handle('projects.add', { rootPath: projectPath })
    const settings = await core.handle('settings.update', {
      defaultModelProfileId: 'ollama-qwen3',
      defaultPermissionMode: 'yolo'
    })
    expect(settings).toEqual({
      defaultModelProfileId: 'ollama-qwen3',
      defaultPermissionMode: 'yolo'
    })
    const thread = await core.handle('threads.create', { projectId: project.id })
    expect(thread.modelProfileId).toBe('ollama-qwen3')
    expect(thread.permissionMode).toBe('yolo')
    await core.close()

    const reopened = new CoreApplication(dataPath, undefined, true)
    await expect(reopened.handle('settings.get', {})).resolves.toEqual(settings)
    await reopened.close()
  })
})
