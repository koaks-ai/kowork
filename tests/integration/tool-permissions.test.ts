import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovalDto, PermissionMode, ProjectDto, RunDto, ThreadDto } from '@kowork/contracts'
import { ApprovalService } from '../../packages/core/src/application/approval-service'
import { CoreEventBus } from '../../packages/core/src/application/event-bus'
import { AppDatabase } from '../../packages/core/src/infrastructure/db/database'

interface PermissionFixture {
  root: string
  projectRoot: string
  externalRoot: string
  database: AppDatabase
  approvals: ApprovalService
  project: ProjectDto
  thread: ThreadDto
  newRun(input: string): RunDto
}

async function fixture(permissionMode: PermissionMode): Promise<PermissionFixture> {
  const root = await mkdtemp(join(tmpdir(), 'kowork-permissions-'))
  const requestedProjectRoot = join(root, 'project')
  const requestedExternalRoot = join(root, 'external')
  await mkdir(requestedProjectRoot)
  await mkdir(requestedExternalRoot)
  const projectRoot = await realpath(requestedProjectRoot)
  const externalRoot = await realpath(requestedExternalRoot)
  const database = new AppDatabase(join(root, 'kowork.sqlite'))
  const events = new CoreEventBus(database)
  const approvals = new ApprovalService(database, events)
  const project = database.addProject(projectRoot, 'project')
  const thread = database.createThread(project.id, 'Permissions', 'ollama-qwen3', permissionMode)
  const newRun = (input: string): RunDto => {
    const request = database.enqueueRequest(thread, input, 32_000)
    return database.createRun(request)
  }
  return {
    root,
    projectRoot,
    externalRoot,
    database,
    approvals,
    project,
    thread,
    newRun
  }
}

async function pending(database: AppDatabase, threadId: string): Promise<ApprovalDto> {
  await expect.poll(() => database.listApprovals(threadId, true).length).toBe(1)
  return database.listApprovals(threadId, true)[0]!
}

describe('tool permissions', () => {
  it.each(['ask', 'auto'] as const)('%s mode asks for every Shell command', async (mode) => {
    const setup = await fixture(mode)
    try {
      const run = setup.newRun(`shell ${mode}`)
      const authorization = setup.approvals.authorizeShell({
        project: setup.project,
        thread: setup.thread,
        runId: run.id,
        cwd: setup.projectRoot,
        command: 'git status'
      })
      const approval = await pending(setup.database, setup.thread.id)
      expect(approval).toMatchObject({ kind: 'shell', requestedAccess: null })
      setup.approvals.respond(approval.id, 'allow')
      await expect(authorization).resolves.toBe(setup.projectRoot)
    } finally {
      setup.approvals.close()
      setup.database.close()
    }
  })

  it('Yolo runs Shell in an external cwd without a path approval', async () => {
    const setup = await fixture('yolo')
    try {
      const run = setup.newRun('external shell')
      await expect(
        setup.approvals.authorizeShell({
          project: setup.project,
          thread: setup.thread,
          runId: run.id,
          cwd: setup.externalRoot,
          command: 'pwd'
        })
      ).resolves.toBe(setup.externalRoot)
      expect(setup.database.listApprovals(setup.thread.id)).toHaveLength(0)
    } finally {
      setup.approvals.close()
      setup.database.close()
    }
  })

  it('keeps external read and write grants separate and scopes grants to one run', async () => {
    const setup = await fixture('auto')
    const firstPath = join(setup.externalRoot, 'first.txt')
    const secondPath = join(setup.externalRoot, 'second.txt')
    await writeFile(firstPath, 'first')
    await writeFile(secondPath, 'second')
    try {
      const readRun = setup.newRun('read external')
      const readAuthorization = setup.approvals.authorizePath({
        project: setup.project,
        thread: setup.thread,
        runId: readRun.id,
        targetPath: firstPath,
        access: 'read',
        targetIsDirectory: false,
        title: 'Read',
        detail: 'read_file first.txt'
      })
      const readApproval = await pending(setup.database, setup.thread.id)
      expect(readApproval.requestedAccess).toBe('read')
      setup.approvals.respond(readApproval.id, 'allow')
      await readAuthorization

      const adjacentAuthorization = setup.approvals.authorizePath({
        project: setup.project,
        thread: setup.thread,
        runId: readRun.id,
        targetPath: secondPath,
        access: 'read',
        targetIsDirectory: false,
        title: 'Read adjacent',
        detail: 'read_file second.txt'
      })
      const adjacentApproval = await pending(setup.database, setup.thread.id)
      setup.approvals.respond(adjacentApproval.id, 'deny')
      await expect(adjacentAuthorization).rejects.toMatchObject({ code: 'permission_denied' })

      const writeAfterRead = setup.approvals.authorizePath({
        project: setup.project,
        thread: setup.thread,
        runId: readRun.id,
        targetPath: firstPath,
        access: 'write',
        targetIsDirectory: false,
        title: 'Write',
        detail: 'write_file first.txt'
      })
      const writeApproval = await pending(setup.database, setup.thread.id)
      expect(writeApproval.requestedAccess).toBe('write')
      setup.approvals.respond(writeApproval.id, 'allow')
      await writeAfterRead
      await expect(
        setup.approvals.authorizePath({
          project: setup.project,
          thread: setup.thread,
          runId: readRun.id,
          targetPath: firstPath,
          access: 'read',
          targetIsDirectory: false,
          title: 'Read through write grant',
          detail: 'read_file first.txt'
        })
      ).resolves.toBe(firstPath)

      const nextRun = setup.newRun('new run')
      const nextRunAuthorization = setup.approvals.authorizePath({
        project: setup.project,
        thread: setup.thread,
        runId: nextRun.id,
        targetPath: firstPath,
        access: 'read',
        targetIsDirectory: false,
        title: 'Read new run',
        detail: 'read_file first.txt'
      })
      const nextRunApproval = await pending(setup.database, setup.thread.id)
      setup.approvals.respond(nextRunApproval.id, 'deny')
      await expect(nextRunAuthorization).rejects.toMatchObject({ code: 'permission_denied' })
    } finally {
      setup.approvals.close()
      setup.database.close()
    }
  })

  it('lets an approved directory grant cover descendants without covering siblings', async () => {
    const setup = await fixture('auto')
    const granted = join(setup.externalRoot, 'granted')
    const sibling = join(setup.externalRoot, 'sibling')
    await mkdir(granted)
    await mkdir(sibling)
    await writeFile(join(granted, 'inside.txt'), 'inside')
    try {
      const run = setup.newRun('directory grant')
      const directoryAuthorization = setup.approvals.authorizePath({
        project: setup.project,
        thread: setup.thread,
        runId: run.id,
        targetPath: granted,
        access: 'read',
        targetIsDirectory: true,
        title: 'Search',
        detail: 'search_files'
      })
      const directoryApproval = await pending(setup.database, setup.thread.id)
      setup.approvals.respond(directoryApproval.id, 'allow')
      await directoryAuthorization
      await expect(
        setup.approvals.authorizePath({
          project: setup.project,
          thread: setup.thread,
          runId: run.id,
          targetPath: join(granted, 'inside.txt'),
          access: 'read',
          targetIsDirectory: false,
          title: 'Read',
          detail: 'read_file inside.txt'
        })
      ).resolves.toBe(join(granted, 'inside.txt'))

      const siblingAuthorization = setup.approvals.authorizePath({
        project: setup.project,
        thread: setup.thread,
        runId: run.id,
        targetPath: sibling,
        access: 'read',
        targetIsDirectory: true,
        title: 'List sibling',
        detail: 'list_files sibling'
      })
      const siblingApproval = await pending(setup.database, setup.thread.id)
      setup.approvals.respond(siblingApproval.id, 'deny')
      await expect(siblingAuthorization).rejects.toMatchObject({ code: 'permission_denied' })
    } finally {
      setup.approvals.close()
      setup.database.close()
    }
  })
})
