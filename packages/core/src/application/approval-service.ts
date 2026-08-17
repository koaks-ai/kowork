import type { ApprovalDto, ProjectDto, ThreadDto } from '@kowork/contracts'
import { CoreError } from '../domain/errors'
import type { AppDatabase } from '../infrastructure/db/database'
import { canonicalizePath, isWithinPath } from '../infrastructure/workspace/path-policy'
import type { CoreEventBus } from './event-bus'

interface PendingApproval {
  settle: (allowed: boolean) => void
}

export class ApprovalService {
  private readonly pending = new Map<string, PendingApproval>()
  private accepting = true

  constructor(
    private readonly database: AppDatabase,
    private readonly events: CoreEventBus
  ) {}

  list(threadId?: string, pendingOnly = false): ApprovalDto[] {
    return this.database.listApprovals(threadId, pendingOnly)
  }

  respond(approvalId: string, decision: 'allow' | 'deny'): ApprovalDto {
    const approval = this.database.resolveApproval(approvalId, decision)
    this.publishResolution(approval, decision)
    this.pending.get(approvalId)?.settle(decision === 'allow')
    return approval
  }

  private async request(
    input: Omit<ApprovalDto, 'id' | 'status' | 'createdAt' | 'resolvedAt'>,
    signal?: AbortSignal
  ): Promise<boolean> {
    if (!this.accepting) throw new CoreError('core_shutting_down', 'Core is shutting down')
    const approval = this.database.createApproval(input)
    this.database.updateRun(input.runId, { status: 'waiting' })
    this.events.publish({
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.runId,
      type: 'approval.requested',
      payload: { approval }
    })
    this.events.publish({
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.runId,
      type: 'run.waiting',
      payload: { approvalId: approval.id }
    })
    const allowed = await new Promise<boolean>((resolve, reject) => {
      let settled = false
      const cleanup = (): void => {
        this.pending.delete(approval.id)
        signal?.removeEventListener('abort', abort)
      }
      const settle = (value: boolean): void => {
        if (settled) return
        settled = true
        cleanup()
        resolve(value)
      }
      const abort = (): void => {
        if (settled) return
        settled = true
        cleanup()
        try {
          const denied = this.database.resolveApproval(approval.id, 'deny')
          this.publishResolution(denied, 'deny', 'run_cancelled')
        } catch {
          // A user response can win the same race as run cancellation.
        }
        reject(
          new CoreError(
            'approval_cancelled',
            typeof signal?.reason === 'string'
              ? signal.reason
              : 'Run cancelled while waiting for approval'
          )
        )
      }

      this.pending.set(approval.id, { settle })
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    })
    if (!signal?.aborted) this.database.updateRun(input.runId, { status: 'running' })
    return allowed
  }

  private publishResolution(
    approval: ApprovalDto,
    decision: 'allow' | 'deny',
    reason?: string
  ): void {
    this.events.publish({
      projectId: approval.projectId,
      threadId: approval.threadId,
      runId: approval.runId,
      type: 'approval.resolved',
      payload: { approvalId: approval.id, decision, ...(reason ? { reason } : {}) }
    })
  }

  async authorizePath(input: {
    project: ProjectDto
    thread: ThreadDto
    runId: string
    targetPath: string
    access: 'read' | 'write'
    targetIsDirectory?: boolean
    title: string
    detail: string
    signal?: AbortSignal
  }): Promise<string> {
    const write = input.access === 'write'
    const canonical = await canonicalizePath(input.targetPath, write)
    const grants = this.database.listPathGrants(input.runId)
    const insideProject = isWithinPath(input.project.rootPath, canonical)
    const insideGrant = grants.some(
      (grant) =>
        (grant.rootPath === canonical ||
          (grant.isDirectory && isWithinPath(grant.rootPath, canonical))) &&
        (input.access === 'read' || grant.accessMode === 'write')
    )

    if (!insideProject && !insideGrant) {
      const proposedRoot = canonical
      const targetKind = input.targetIsDirectory ? '目录' : '文件'
      const action = write ? '修改' : '读取'
      const allowed = await this.request(
        {
          projectId: input.project.id,
          threadId: input.thread.id,
          runId: input.runId,
          kind: 'external_path',
          title: `${action}项目外${targetKind}`,
          detail: `${input.detail}\n授权${targetKind}：${proposedRoot}`,
          requestedPath: proposedRoot,
          requestedAccess: input.access
        },
        input.signal
      )
      if (!allowed)
        throw new CoreError('permission_denied', `Access to '${proposedRoot}' was denied`)
      this.database.addPathGrant(
        input.runId,
        proposedRoot,
        input.access,
        input.targetIsDirectory ?? false
      )
      return canonical
    }

    if (insideProject && write && input.thread.permissionMode === 'ask') {
      const allowed = await this.request(
        {
          projectId: input.project.id,
          threadId: input.thread.id,
          runId: input.runId,
          kind: 'file_write',
          title: input.title,
          detail: input.detail,
          requestedPath: canonical,
          requestedAccess: 'write'
        },
        input.signal
      )
      if (!allowed) throw new CoreError('permission_denied', `Write to '${canonical}' was denied`)
    }
    return canonical
  }

  async authorizeShell(input: {
    project: ProjectDto
    thread: ThreadDto
    runId: string
    cwd: string
    command: string
    signal?: AbortSignal
  }): Promise<string> {
    const canonicalCwd = await canonicalizePath(input.cwd)
    if (input.thread.permissionMode !== 'yolo') {
      const allowed = await this.request(
        {
          projectId: input.project.id,
          threadId: input.thread.id,
          runId: input.runId,
          kind: 'shell',
          title: '执行命令',
          detail: `${input.command}\n工作目录：${canonicalCwd}`,
          requestedPath: canonicalCwd,
          requestedAccess: null
        },
        input.signal
      )
      if (!allowed)
        throw new CoreError('permission_denied', `Command '${input.command}' was denied`)
    }
    return canonicalCwd
  }

  close(): void {
    this.accepting = false
    for (const [approvalId, pending] of [...this.pending]) {
      try {
        const approval = this.database.resolveApproval(approvalId, 'deny')
        this.publishResolution(approval, 'deny', 'core_shutdown')
      } catch {
        // A concurrent response may already have resolved the persisted approval.
      }
      pending.settle(false)
    }
    this.pending.clear()
  }
}
