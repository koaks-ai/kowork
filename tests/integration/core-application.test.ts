import { createServer } from 'node:http'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CoreApplication } from '@kowork/core'
import type { RunEventDto } from '@kowork/contracts'

describe('Core application', () => {
  it('runs a request through the beta4 handle event API', async () => {
    const dataPath = await mkdtemp(join(tmpdir(), 'kowork-koaks-beta4-'))
    const projectPath = join(dataPath, 'project')
    await mkdir(projectPath)
    let titleRequestBody = ''
    const server = createServer(async (request, response) => {
      let body = ''
      for await (const chunk of request) body += chunk
      const payload = JSON.parse(body) as { messages: Array<{ role: string }> }
      const titleRequest = body.includes('Create a short, specific conversation title')
      if (titleRequest) titleRequestBody = body
      const afterTool = payload.messages.at(-1)?.role === 'tool'
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(
        `data: ${JSON.stringify({
          id: 'fixture-response',
          choices: [
            {
              index: 0,
              delta: titleRequest
                ? { content: 'Beta4 API' }
                : afterTool
                  ? { content: 'beta4 handle response' }
                  : {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'beta4-tool-call',
                          type: 'function',
                          function: {
                            name: 'run_command',
                            arguments: JSON.stringify({
                              command: 'printf beta4-progress',
                              cwd: projectPath
                            })
                          }
                        }
                      ]
                    }
            }
          ],
          usage:
            titleRequest || afterTool
              ? { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 }
              : undefined
        })}\n\n`
      )
      response.end('data: [DONE]\n\n')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Fixture server did not bind')

    const core = new CoreApplication(dataPath, { get: async () => 'fixture-key' })
    const events: RunEventDto[] = []
    core.subscribe((event) => events.push(event))
    try {
      const provider = await core.handle('providers.create', {
        id: 'fixture-openai',
        name: 'Fixture OpenAI',
        kind: 'custom',
        protocol: 'openai-chat',
        baseUrl: `http://127.0.0.1:${address.port}`,
        credentialId: 'fixture-openai',
        defaultContextWindowTokens: 32_000
      })
      const model = await core.handle('models.add', {
        providerId: provider.id,
        model: 'fixture-model',
        contextWindowTokens: 32_000
      })
      const project = await core.handle('projects.add', { rootPath: projectPath })
      const created = await core.handle('threads.create', { projectId: project.id })
      const thread = await core.handle('threads.update', {
        threadId: created.id,
        modelProfileId: model.id,
        permissionMode: 'ask'
      })

      await core.handle('runs.enqueue', { threadId: thread.id, input: 'Use the new handle API' })
      await expect
        .poll(
          async () =>
            (await core.handle('approvals.list', { threadId: thread.id, pendingOnly: true }))
              .length,
          { timeout: 10_000 }
        )
        .toBe(1)
      const approval = (
        await core.handle('approvals.list', { threadId: thread.id, pendingOnly: true })
      )[0]
      expect(approval).toMatchObject({ kind: 'shell', runId: expect.any(String) })
      await core.handle('approvals.respond', { approvalId: approval!.id, decision: 'allow' })
      await expect
        .poll(() => events.some((event) => event.type === 'run.completed'), { timeout: 10_000 })
        .toBe(true)
      await expect
        .poll(async () => (await core.handle('threads.list', { projectId: project.id }))[0]?.title)
        .toBe('Beta4 API')
      expect(titleRequestBody).toContain('no more than 10 characters')
      expect(titleRequestBody).not.toContain('response_format')

      const text = events
        .filter((event) => event.type === 'run.text')
        .map((event) => String(event.payload.text ?? ''))
        .join('')
      expect(text).toBe('beta4 handle response')
      const toolCall = events.find((event) => event.type === 'run.tool-call')
      const callId = (toolCall?.payload.call as { id?: string } | undefined)?.id
      expect(callId).toBeTruthy()
      const toolOutputs = events.filter((event) => event.type === 'run.tool-output')
      expect(toolOutputs.length).toBeGreaterThanOrEqual(2)
      expect(toolOutputs.every((event) => event.payload.callId === callId)).toBe(true)
      expect(
        toolOutputs.some(
          (event) => event.payload.stream === 'stdout' && event.payload.text === 'beta4-progress'
        )
      ).toBe(true)
      expect((await core.handle('runs.list', { threadId: thread.id }))[0]).toMatchObject({
        status: 'completed',
        totalTokens: 7
      })

      const beforeDeniedRun = events.at(-1)?.sequence ?? 0
      await core.handle('runs.enqueue', { threadId: thread.id, input: 'Try the command again' })
      await expect
        .poll(
          async () =>
            (await core.handle('approvals.list', { threadId: thread.id, pendingOnly: true }))
              .length,
          { timeout: 10_000 }
        )
        .toBe(1)
      const deniedApproval = (
        await core.handle('approvals.list', { threadId: thread.id, pendingOnly: true })
      )[0]
      await core.handle('approvals.respond', {
        approvalId: deniedApproval!.id,
        decision: 'deny'
      })
      await expect
        .poll(
          () =>
            events.filter(
              (event) => event.sequence > beforeDeniedRun && event.type === 'run.completed'
            ).length,
          { timeout: 10_000 }
        )
        .toBe(1)
      expect(
        events.some(
          (event) =>
            event.sequence > beforeDeniedRun &&
            event.type === 'run.tool-output' &&
            event.payload.isError === true
        )
      ).toBe(true)

      const beforeCancelledRun = events.at(-1)?.sequence ?? 0
      await core.handle('runs.enqueue', { threadId: thread.id, input: 'Cancel this command' })
      await expect
        .poll(
          async () =>
            (await core.handle('approvals.list', { threadId: thread.id, pendingOnly: true }))
              .length,
          { timeout: 10_000 }
        )
        .toBe(1)
      const cancelledApproval = (
        await core.handle('approvals.list', { threadId: thread.id, pendingOnly: true })
      )[0]
      const activeRun = (await core.handle('runs.list', { threadId: thread.id })).find(
        (run) => run.status === 'waiting' || run.status === 'running'
      )
      expect(activeRun).toBeDefined()
      await core.handle('runs.cancel', { runId: activeRun!.id })
      await expect
        .poll(
          () =>
            events.filter(
              (event) => event.sequence > beforeCancelledRun && event.type === 'run.cancelled'
            ).length,
          { timeout: 10_000 }
        )
        .toBe(1)
      expect(
        (await core.handle('approvals.list', { threadId: thread.id })).find(
          (approval) => approval.id === cancelledApproval!.id
        )?.status
      ).toBe('denied')
    } finally {
      await core.close()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })

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

  it('names an untitled session from its first message without overwriting a rename', async () => {
    const dataPath = await mkdtemp(join(tmpdir(), 'kowork-thread-title-'))
    const projectPath = join(dataPath, 'project')
    await mkdir(projectPath)
    const core = new CoreApplication(dataPath, undefined, true)
    const events: RunEventDto[] = []
    core.subscribe((event) => events.push(event))
    const project = await core.handle('projects.add', { rootPath: projectPath })
    const thread = await core.handle('threads.create', { projectId: project.id })
    expect(thread.title).toBe('')

    await core.handle('runs.enqueue', {
      threadId: thread.id,
      input: '  修复登录页面的布局问题  '
    })
    await expect
      .poll(async () => (await core.handle('threads.list', { projectId: project.id }))[0]?.title)
      .toBe('修复登录页面的布局…')
    expect(events.some((event) => event.type === 'thread.updated')).toBe(true)

    await core.handle('threads.update', { threadId: thread.id, title: '手动命名的会话' })
    await expect
      .poll(() => events.filter((event) => event.type === 'run.completed').length, {
        timeout: 5_000
      })
      .toBe(1)
    await core.handle('runs.enqueue', { threadId: thread.id, input: '第二条消息' })
    await expect
      .poll(async () => (await core.handle('threads.list', { projectId: project.id }))[0]?.title)
      .toBe('手动命名的会话')
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
