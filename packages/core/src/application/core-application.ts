import { join } from 'node:path'
import type { AppBootstrapDto, RpcInput, RpcMethod, RpcOutput } from '@kowork/contracts'
import { parseRpcInput } from '@kowork/contracts'
import { toCoreError } from '../domain/errors'
import { AppDatabase } from '../infrastructure/db/database'
import { GitService } from '../infrastructure/git/git-service'
import { FakeAgentRuntime } from '../infrastructure/koaks/fake-runtime'
import { KoaksAgentRuntime } from '../infrastructure/koaks/koaks-runtime'
import type { AgentRuntimePort } from '../infrastructure/koaks/runtime-port'
import { CommandRunner } from '../infrastructure/shell/command-runner'
import { FileService } from '../infrastructure/workspace/file-service'
import { ApprovalService } from './approval-service'
import { CoreEventBus, type EventListener } from './event-bus'
import { ProjectService } from './project-service'
import { RunCoordinator } from './run-coordinator'
import { ProviderService } from './provider-service'
import {
  emptyCredentialProvider,
  type CredentialProvider
} from '../infrastructure/credentials/credential-provider'

export class CoreApplication {
  private readonly database: AppDatabase
  private readonly events: CoreEventBus
  private readonly approvals: ApprovalService
  private readonly projects: ProjectService
  private readonly providers: ProviderService
  private readonly files: FileService
  private readonly git: GitService
  private readonly commands: CommandRunner
  private readonly runtime: AgentRuntimePort
  private readonly runs: RunCoordinator

  constructor(
    dataPath: string,
    credentials: CredentialProvider = emptyCredentialProvider,
    testMode = false
  ) {
    this.database = new AppDatabase(join(dataPath, 'kowork.sqlite'))
    this.events = new CoreEventBus(this.database)
    this.approvals = new ApprovalService(this.database, this.events)
    this.projects = new ProjectService(this.database)
    this.providers = new ProviderService(this.database, credentials)
    this.files = new FileService()
    this.git = new GitService()
    this.commands = new CommandRunner()
    this.runtime = testMode
      ? new FakeAgentRuntime()
      : new KoaksAgentRuntime(
          this.database,
          credentials,
          this.files,
          this.commands,
          this.git,
          this.approvals,
          this.events
        )
    this.runs = new RunCoordinator(this.database, this.runtime, this.events)

    for (const run of this.database.recoverInterruptedRuns()) {
      const thread = this.database.getThread(run.threadId)
      this.events.publish({
        projectId: thread.projectId,
        threadId: run.threadId,
        runId: run.id,
        type: 'run.interrupted',
        payload: { reason: 'core_restarted' }
      })
    }
    void this.runs.restoreQueues()
  }

  subscribe(listener: EventListener): () => void {
    return this.events.subscribe(listener)
  }

  async handle<M extends RpcMethod>(method: M, rawInput: unknown): Promise<RpcOutput<M>> {
    const input = parseRpcInput(method, rawInput)
    try {
      return (await this.dispatch(method, input)) as RpcOutput<M>
    } catch (error) {
      throw toCoreError(error)
    }
  }

  private async dispatch<M extends RpcMethod>(method: M, input: RpcInput<M>): Promise<unknown> {
    switch (method) {
      case 'app.bootstrap':
        return this.bootstrap()
      case 'projects.list':
        return this.projects.list((input as RpcInput<'projects.list'>).includeDeleted)
      case 'projects.add':
        return await this.projects.add((input as RpcInput<'projects.add'>).rootPath)
      case 'projects.archive':
        return this.projects.archive((input as RpcInput<'projects.archive'>).projectId)
      case 'projects.restore':
        return this.projects.restore((input as RpcInput<'projects.restore'>).projectId)
      case 'threads.list': {
        const value = input as RpcInput<'threads.list'>
        return this.database.listThreads(value.projectId, value.includeDeleted)
      }
      case 'threads.create': {
        const value = input as RpcInput<'threads.create'>
        const settings = this.database.getSettings()
        const profiles = this.database.listProfiles()
        const available =
          profiles.find(
            (profile) => profile.id === settings.defaultModelProfileId && profile.available
          ) ?? profiles.find((profile) => profile.available)
        return this.database.createThread(
          value.projectId,
          value.title?.trim() || '新的会话',
          available?.id ?? 'deepseek-chat',
          settings.defaultPermissionMode
        )
      }
      case 'threads.update': {
        const { threadId, ...changes } = input as RpcInput<'threads.update'>
        if (changes.modelProfileId) this.database.getProfile(changes.modelProfileId)
        return this.database.updateThread(threadId, changes)
      }
      case 'threads.archive':
        return this.database.updateThread((input as RpcInput<'threads.archive'>).threadId, {
          deletedAt: Date.now()
        })
      case 'threads.restore':
        return this.database.updateThread((input as RpcInput<'threads.restore'>).threadId, {
          deletedAt: null
        })
      case 'runs.enqueue': {
        const value = input as RpcInput<'runs.enqueue'>
        return this.runs.enqueue(value.threadId, value.input)
      }
      case 'runs.cancel':
        return this.runs.cancel((input as RpcInput<'runs.cancel'>).runId)
      case 'runs.resumeQueue':
        return this.runs.resumeQueue((input as RpcInput<'runs.resumeQueue'>).threadId)
      case 'runs.removeQueued':
        return this.runs.removeQueued((input as RpcInput<'runs.removeQueued'>).requestId)
      case 'runs.list':
        return this.database.listRuns((input as RpcInput<'runs.list'>).threadId)
      case 'runs.queue':
        return this.database.listQueue((input as RpcInput<'runs.queue'>).threadId)
      case 'events.list': {
        const value = input as RpcInput<'events.list'>
        return this.database.listEvents(value.threadId, value.afterSequence)
      }
      case 'approvals.list': {
        const value = input as RpcInput<'approvals.list'>
        return this.approvals.list(value.threadId, value.pendingOnly)
      }
      case 'approvals.respond': {
        const value = input as RpcInput<'approvals.respond'>
        return this.approvals.respond(value.approvalId, value.decision)
      }
      case 'providers.list':
        return this.providers.list()
      case 'providers.create': {
        const value = input as RpcInput<'providers.create'>
        return this.providers.create(value)
      }
      case 'providers.update': {
        const { providerId, ...changes } = input as RpcInput<'providers.update'>
        return this.providers.update(providerId, changes)
      }
      case 'providers.archive':
        return this.providers.archive((input as RpcInput<'providers.archive'>).providerId)
      case 'providers.refreshModels':
        return await this.providers.refreshModels(
          (input as RpcInput<'providers.refreshModels'>).providerId
        )
      case 'models.add':
        return this.providers.addModel(input as RpcInput<'models.add'>)
      case 'models.archive':
        return this.providers.archiveModel((input as RpcInput<'models.archive'>).modelProfileId)
      case 'settings.get':
        return this.database.getSettings()
      case 'settings.update': {
        const value = input as RpcInput<'settings.update'>
        if (value.defaultModelProfileId) this.database.getProfile(value.defaultModelProfileId)
        return this.database.updateSettings(value)
      }
      case 'files.list': {
        const value = input as RpcInput<'files.list'>
        return await this.files.list(this.database.getProject(value.projectId), value.relativePath)
      }
      case 'files.read': {
        const value = input as RpcInput<'files.read'>
        return await this.files.read(this.database.getProject(value.projectId), value.relativePath)
      }
      case 'git.status':
        return await this.git.status(
          this.database.getProject((input as RpcInput<'git.status'>).projectId)
        )
      case 'git.diff': {
        const value = input as RpcInput<'git.diff'>
        return await this.git.diff(this.database.getProject(value.projectId), value.relativePath)
      }
    }
  }

  private bootstrap(): AppBootstrapDto {
    return {
      projects: this.database.listProjects(),
      providers: this.database.listProviders(),
      modelProfiles: this.database.listProfiles(),
      settings: this.database.getSettings(),
      activeRuns: this.database.listActiveRuns(),
      pendingApprovals: this.database.listApprovals(undefined, true),
      lastEventSequence: this.database.lastEventSequence()
    }
  }

  async close(): Promise<void> {
    const closingRuns = this.runs.close()
    this.approvals.close()
    await closingRuns
    this.database.close()
  }
}
