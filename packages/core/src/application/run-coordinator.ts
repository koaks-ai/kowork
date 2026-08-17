import type { QueuedRequestDto, RunDto, ThreadDto } from '@kowork/contracts'
import { CoreError, toCoreError } from '../domain/errors'
import type { AppDatabase } from '../infrastructure/db/database'
import type { AgentRuntimePort, AgentUsage } from '../infrastructure/koaks/runtime-port'
import type { CoreEventBus } from './event-bus'
import { createFallbackThreadTitle, isUntitledThreadTitle } from '../domain/thread-title'

interface ActiveRun {
  run: RunDto
  controller: AbortController
  promise: Promise<void>
}

const zeroUsage: AgentUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedInputTokens: 0,
  reasoningOutputTokens: 0
}

export class RunCoordinator {
  private readonly activeByThread = new Map<string, ActiveRun>()
  private readonly titleTasks = new Set<Promise<void>>()
  private accepting = true

  constructor(
    private readonly database: AppDatabase,
    private readonly runtime: AgentRuntimePort,
    private readonly events: CoreEventBus
  ) {}

  enqueue(threadId: string, input: string): QueuedRequestDto {
    if (!this.accepting) throw new CoreError('core_shutting_down', 'Core is shutting down')
    const thread = this.database.getThread(threadId)
    if (thread.deletedAt)
      throw new CoreError('thread_archived', 'Cannot enqueue work in an archived thread')
    const profile = this.database.getProfile(thread.modelProfileId)
    const request = this.database.enqueueRequest(
      thread,
      input,
      thread.contextWindowTokens ?? profile.contextWindowTokens
    )
    const project = this.database.getProject(thread.projectId)
    this.events.publish({
      projectId: project.id,
      threadId,
      type: 'request.queued',
      payload: { requestId: request.id, input, position: request.position }
    })
    void this.kick(threadId)
    return request
  }

  async kick(threadId: string): Promise<void> {
    if (!this.accepting || this.activeByThread.has(threadId)) return
    const thread = this.database.getThread(threadId)
    if (thread.queuePaused || thread.deletedAt) return
    const request = this.database.nextQueued(threadId)
    if (!request) return
    this.database.updateRequest(request.id, 'running')
    const run = this.database.createRun(request)
    const controller = new AbortController()
    const promise = this.execute(thread, request, run, controller)
    this.activeByThread.set(threadId, { run, controller, promise })
    await promise
  }

  private async execute(
    thread: ThreadDto,
    request: QueuedRequestDto,
    run: RunDto,
    controller: AbortController
  ): Promise<void> {
    const project = this.database.getProject(thread.projectId)
    let usage = zeroUsage
    let currentStep = 1
    let finalStep = 0
    let finalText = ''
    try {
      this.database.updateRun(run.id, { status: 'running' })
      this.events.publish({
        projectId: project.id,
        threadId: thread.id,
        runId: run.id,
        type: 'run.started',
        payload: {
          requestId: request.id,
          input: request.input,
          modelProfileId: request.modelProfileId
        }
      })
      const profile = this.database.getProfile(request.modelProfileId)
      this.startTitleGeneration(thread, request, profile, controller.signal)
      await this.runtime.compressIfNeeded({
        project,
        thread,
        request,
        profile,
        signal: controller.signal
      })
      for await (const event of this.runtime.stream({
        project,
        thread,
        request,
        runId: run.id,
        signal: controller.signal
      })) {
        if (event.type === 'text_delta') {
          this.events.publish({
            projectId: project.id,
            threadId: thread.id,
            runId: run.id,
            type: 'run.text',
            payload: { text: event.text, step: currentStep, itemRef: event.itemRef }
          })
        } else if (event.type === 'reasoning_delta') {
          this.events.publish({
            projectId: project.id,
            threadId: thread.id,
            runId: run.id,
            type: 'run.reasoning',
            payload: { text: event.text, kind: event.kind, itemRef: event.itemRef }
          })
        } else if (event.type === 'model') {
          const type =
            event.event.type === 'tool_call_delta'
              ? 'run.tool-call-delta'
              : event.event.type === 'refusal_delta'
                ? 'run.refusal'
                : event.event.type === 'annotation_added'
                  ? 'run.annotation'
                  : undefined
          if (type) {
            this.events.publish({
              projectId: project.id,
              threadId: thread.id,
              runId: run.id,
              type,
              payload: { event: event.event, step: event.step, phase: event.phase }
            })
          }
        } else if (event.type === 'tool_call_requested') {
          this.events.publish({
            projectId: project.id,
            threadId: thread.id,
            runId: run.id,
            type: 'run.tool-call',
            payload: { call: event.call }
          })
        } else if (event.type === 'tool_result') {
          this.events.publish({
            projectId: project.id,
            threadId: thread.id,
            runId: run.id,
            type: 'run.tool-output',
            payload: { callId: event.callId, text: event.output, isError: event.isError }
          })
        } else if (event.type === 'tool_progress') {
          const progress = event.progress
          this.events.publish({
            projectId: project.id,
            threadId: thread.id,
            runId: run.id,
            type: 'run.tool-output',
            payload:
              progress.type === 'output'
                ? {
                    callId: event.callId,
                    stream: progress.stream ?? 'stdout',
                    text: progress.text
                  }
                : progress.type === 'status'
                  ? { callId: event.callId, stream: 'status', text: progress.message }
                  : {
                      callId: event.callId,
                      stream: 'custom',
                      kind: progress.kind,
                      data: progress.payload,
                      text: JSON.stringify(progress.payload)
                    }
          })
        } else if (event.type === 'step_completed') {
          finalStep = event.step
          currentStep = event.step + 1
        } else if (event.type === 'completed') {
          usage = event.usage
          finalText = event.finalText
        } else if (event.type === 'failed') {
          usage = event.usage
          throw new CoreError(event.error.type, event.error.message)
        } else if (event.type === 'incomplete' || event.type === 'terminated') {
          usage = event.usage ?? usage
          throw new CoreError(event.type, `Agent run ${event.type}`)
        }
      }
      this.database.updateRun(run.id, {
        status: 'completed',
        finishedAt: Date.now(),
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens
      })
      this.database.updateRequest(request.id, 'completed')
      this.events.publish({
        projectId: project.id,
        threadId: thread.id,
        runId: run.id,
        type: 'run.completed',
        payload: { usage, finalText, finalStep }
      })
    } catch (error) {
      const cancelled = controller.signal.aborted
      const coreError = toCoreError(error)
      const status = cancelled ? 'cancelled' : 'failed'
      this.database.updateRun(run.id, { status, finishedAt: Date.now(), error: coreError.message })
      this.database.updateRequest(request.id, status)
      this.database.updateThread(thread.id, { queuePaused: true })
      this.events.publish({
        projectId: project.id,
        threadId: thread.id,
        runId: run.id,
        type: cancelled ? 'run.cancelled' : 'run.failed',
        payload: { code: coreError.code, message: coreError.message }
      })
      this.events.publish({
        projectId: project.id,
        threadId: thread.id,
        runId: run.id,
        type: 'queue.paused',
        payload: { reason: status }
      })
    } finally {
      this.activeByThread.delete(thread.id)
      if (!this.database.getThread(thread.id).queuePaused) void this.kick(thread.id)
    }
  }

  private startTitleGeneration(
    thread: ThreadDto,
    request: QueuedRequestDto,
    profile: Parameters<AgentRuntimePort['generateTitle']>[0]['profile'],
    signal: AbortSignal
  ): void {
    if (request.position !== 0 || !isUntitledThreadTitle(thread.title)) return

    const task = (async () => {
      let title = createFallbackThreadTitle(request.input)
      try {
        title = await this.runtime.generateTitle({ message: request.input, profile, signal })
      } catch {
        // A title is optional metadata; the first chat run must continue on model failure.
      }

      const current = this.database.getThread(thread.id)
      if (!isUntitledThreadTitle(current.title)) return
      const updated = this.database.updateThread(thread.id, { title })
      this.events.publish({
        projectId: thread.projectId,
        threadId: thread.id,
        type: 'thread.updated',
        payload: { thread: updated, source: 'first_message' }
      })
    })()
    this.titleTasks.add(task)
    void task.then(
      () => this.titleTasks.delete(task),
      () => this.titleTasks.delete(task)
    )
  }

  cancel(runId: string): RunDto {
    const run = this.database.getRun(runId)
    const active = this.activeByThread.get(run.threadId)
    if (!active || active.run.id !== runId)
      throw new CoreError('run_not_active', `Run '${runId}' is not active`)
    active.controller.abort('Cancelled by user')
    return this.database.getRun(runId)
  }

  resumeQueue(threadId: string): ThreadDto {
    const thread = this.database.updateThread(threadId, { queuePaused: false })
    this.events.publish({
      projectId: thread.projectId,
      threadId,
      type: 'queue.resumed',
      payload: {}
    })
    void this.kick(threadId)
    return thread
  }

  removeQueued(requestId: string): QueuedRequestDto {
    const existing = this.database.getRequest(requestId)
    if (existing.status !== 'queued')
      throw new CoreError('request_not_queued', `Request '${requestId}' is not queued`)
    return this.database.updateRequest(requestId, 'cancelled')
  }

  async restoreQueues(): Promise<void> {
    for (const project of this.database.listProjects()) {
      for (const thread of this.database.listThreads(project.id)) {
        if (!thread.queuePaused) void this.kick(thread.id)
      }
    }
  }

  async close(): Promise<void> {
    this.accepting = false
    for (const active of this.activeByThread.values())
      active.controller.abort('Application shutting down')
    await Promise.all(
      [...this.activeByThread.values()].map((active) => active.promise.catch(() => undefined))
    )
    await Promise.all([...this.titleTasks].map((task) => task.catch(() => undefined)))
    await this.runtime.close()
  }
}
