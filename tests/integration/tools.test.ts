import { execFile } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import type { ProjectDto } from '@kowork/contracts'
import { GitService } from '../../packages/core/src/infrastructure/git/git-service'
import { CommandRunner } from '../../packages/core/src/infrastructure/shell/command-runner'
import { FileService } from '../../packages/core/src/infrastructure/workspace/file-service'

const exec = promisify(execFile)
const activeSignal = (): AbortSignal => new AbortController().signal

function project(rootPath: string): ProjectDto {
  return {
    id: 'project-tools',
    name: 'tools',
    rootPath,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null
  }
}

describe('file tools', () => {
  it('lists shallow entries with stable pagination and reads numbered line ranges', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-files-'))
    await mkdir(join(root, 'directory'))
    await writeFile(join(root, 'b.txt'), 'first\nsecond\nthird\n')
    await writeFile(join(root, 'a.txt'), 'a')
    const files = new FileService()

    await expect(
      files.listForTool({
        projectRoot: root,
        path: root,
        offset: 0,
        limit: 2,
        signal: activeSignal()
      })
    ).resolves.toMatchObject({
      entries: [
        { name: 'directory', kind: 'directory' },
        { name: 'a.txt', kind: 'file' }
      ],
      total: 3,
      nextOffset: 2
    })

    await expect(
      files.readForTool({
        projectRoot: root,
        path: join(root, 'b.txt'),
        offset: 2,
        limit: 1,
        signal: activeSignal()
      })
    ).resolves.toMatchObject({
      content: '2\tsecond',
      startLine: 2,
      endLine: 2,
      totalLines: 3,
      truncated: true
    })
  })

  it('honors gitignore for globbing and supports regex search context', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-scan-'))
    await exec('git', ['init'], { cwd: root })
    await writeFile(join(root, '.gitignore'), 'ignored.ts\n')
    await writeFile(join(root, 'kept.ts'), 'alpha\nNeedle 42\nomega\n')
    await writeFile(join(root, 'ignored.ts'), 'Needle ignored\n')
    const files = new FileService()

    await expect(
      files.globForTool({
        projectRoot: root,
        path: root,
        pattern: '*.ts',
        limit: 200,
        signal: activeSignal()
      })
    ).resolves.toMatchObject({ matches: ['kept.ts'], truncated: false })

    const searched = await files.searchForTool({
      projectRoot: root,
      path: root,
      pattern: 'needle\\s+\\d+',
      glob: '*.ts',
      caseSensitive: false,
      context: 1,
      limit: 200,
      signal: activeSignal()
    })
    expect(searched).toMatchObject({
      matches: [
        {
          path: 'kept.ts',
          line: 2,
          text: 'Needle 42',
          before: ['alpha'],
          after: ['omega']
        }
      ],
      truncated: false
    })
  })

  it('rejects binary and oversized files and uses stable edit errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-file-errors-'))
    const files = new FileService()
    await writeFile(join(root, 'binary.bin'), Buffer.from([1, 0, 2]))
    await writeFile(join(root, 'large.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 65))
    await writeFile(join(root, 'source.txt'), 'same\nsame\n')

    await expect(
      files.readForTool({
        projectRoot: root,
        path: join(root, 'binary.bin'),
        offset: 1,
        limit: 10,
        signal: activeSignal()
      })
    ).rejects.toMatchObject({ code: 'binary_file' })
    await expect(
      files.readForTool({
        projectRoot: root,
        path: join(root, 'large.txt'),
        offset: 1,
        limit: 10,
        signal: activeSignal()
      })
    ).rejects.toMatchObject({ code: 'file_too_large' })
    await expect(
      files.editForTool({
        projectRoot: root,
        path: join(root, 'source.txt'),
        oldText: 'missing',
        newText: 'new',
        replaceAll: false,
        signal: activeSignal()
      })
    ).rejects.toMatchObject({ code: 'match_not_found' })
    await expect(
      files.editForTool({
        projectRoot: root,
        path: join(root, 'source.txt'),
        oldText: 'same',
        newText: 'new',
        replaceAll: false,
        signal: activeSignal()
      })
    ).rejects.toMatchObject({ code: 'ambiguous_match' })
  })

  it('edits exact text, atomically overwrites, preserves mode, and observes cancellation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-write-'))
    const path = join(root, 'source.txt')
    const files = new FileService()
    await writeFile(path, 'before\n')
    await chmod(path, 0o640)

    await files.editForTool({
      projectRoot: root,
      path,
      oldText: 'before',
      newText: 'after',
      replaceAll: false,
      signal: activeSignal()
    })
    expect(await readFile(path, 'utf8')).toBe('after\n')
    await files.writeForTool({
      projectRoot: root,
      path,
      content: 'replacement',
      signal: activeSignal()
    })
    expect(await readFile(path, 'utf8')).toBe('replacement')
    expect((await stat(path)).mode & 0o777).toBe(0o640)

    const controller = new AbortController()
    controller.abort('stop')
    await expect(
      files.writeForTool({
        projectRoot: root,
        path: join(root, 'cancelled.txt'),
        content: 'never',
        signal: controller.signal
      })
    ).rejects.toMatchObject({ code: 'tool_cancelled' })
  })
})

describe('Shell tool runner', () => {
  const node = JSON.stringify(process.execPath)
  const command = (script: string): string => `${node} -e ${JSON.stringify(script)}`
  const noProgress = async (): Promise<void> => undefined

  it('returns success and reports non-zero exits as tool errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-shell-'))
    const runner = new CommandRunner()
    await expect(
      runner.run({
        command: command("process.stdout.write('ok')"),
        cwd: root,
        timeoutMs: 5_000,
        signal: activeSignal(),
        reportProgress: noProgress
      })
    ).resolves.toMatchObject({ stdout: 'ok', exitCode: 0, truncated: false })
    await expect(
      runner.run({
        command: command("process.stderr.write('bad'); process.exit(7)"),
        cwd: root,
        timeoutMs: 5_000,
        signal: activeSignal(),
        reportProgress: noProgress
      })
    ).rejects.toMatchObject({ code: 'command_failed', details: { exitCode: 7 } })
  })

  it('times out, cancels the process tree, and bounds progress persistence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-shell-limits-'))
    const runner = new CommandRunner()
    await expect(
      runner.run({
        command: command('setInterval(() => {}, 1000)'),
        cwd: root,
        timeoutMs: 50,
        signal: activeSignal(),
        reportProgress: noProgress
      })
    ).rejects.toMatchObject({ code: 'command_timed_out' })

    const marker = join(root, 'child-survived.txt')
    const controller = new AbortController()
    const cancellation = runner.run({
      command: command(
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started'); setTimeout(() => require('node:fs').appendFileSync(${JSON.stringify(marker)}, '-late'), 500); setInterval(() => {}, 1000)`
      ),
      cwd: root,
      timeoutMs: 5_000,
      signal: controller.signal,
      reportProgress: noProgress
    })
    await expect
      .poll(async () => await readFile(marker, 'utf8').catch(() => ''), { timeout: 2_000 })
      .toBe('started')
    controller.abort('cancelled by test')
    await expect(cancellation).rejects.toMatchObject({ code: 'tool_cancelled' })
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(await readFile(marker, 'utf8')).toBe('started')

    const progress: Array<{ type: string; text?: string; message?: string }> = []
    const result = await runner.run({
      command: command("process.stdout.write('x'.repeat(300000))"),
      cwd: root,
      timeoutMs: 5_000,
      signal: activeSignal(),
      reportProgress: async (event) => {
        progress.push(event)
      }
    })
    expect(result.truncated).toBe(true)
    expect(result.originalChars).toBe(300_000)
    expect(
      progress
        .filter((event) => event.type === 'output')
        .reduce((total, event) => total + (event.text?.length ?? 0), 0)
    ).toBe(256_000)
    expect(
      progress.filter((event) => event.message?.includes('stream output truncated'))
    ).toHaveLength(1)
  })
})

describe('Git tools', () => {
  it('returns structured status and unstaged, staged, and HEAD diffs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-git-tools-'))
    await exec('git', ['init', '-b', 'main'], { cwd: root })
    await exec('git', ['config', 'user.name', 'KoWork Test'], { cwd: root })
    await exec('git', ['config', 'user.email', 'kowork@example.invalid'], { cwd: root })
    await writeFile(join(root, 'staged.txt'), 'original\n')
    await writeFile(join(root, 'worktree.txt'), 'original\n')
    await exec('git', ['add', '.'], { cwd: root })
    await exec('git', ['commit', '-m', 'initial'], { cwd: root })
    await writeFile(join(root, 'staged.txt'), 'staged\n')
    await exec('git', ['add', 'staged.txt'], { cwd: root })
    await writeFile(join(root, 'worktree.txt'), 'worktree\n')

    const git = new GitService()
    const value = project(root)
    expect(await git.status(value, activeSignal())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'staged.txt', indexStatus: 'M' }),
        expect.objectContaining({ path: 'worktree.txt', worktreeStatus: 'M' })
      ])
    )
    expect((await git.diff(value, undefined, 'unstaged', activeSignal())).diff).toContain(
      '+worktree'
    )
    expect((await git.diff(value, undefined, 'staged', activeSignal())).diff).toContain('+staged')
    const head = await git.diff(value, undefined, 'head', activeSignal())
    expect(head.diff).toContain('+staged')
    expect(head.diff).toContain('+worktree')
  })

  it('returns empty results outside a Git repository and supports a repository without commits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kowork-not-git-'))
    const git = new GitService()
    expect(await git.status(project(root), activeSignal())).toEqual([])
    expect((await git.diff(project(root), undefined, 'head', activeSignal())).diff).toBe('')

    const uncommitted = await mkdtemp(join(tmpdir(), 'kowork-no-head-'))
    await exec('git', ['init'], { cwd: uncommitted })
    await writeFile(join(uncommitted, 'file.txt'), 'new\n')
    await exec('git', ['add', 'file.txt'], { cwd: uncommitted })
    expect(
      (await git.diff(project(uncommitted), undefined, 'head', activeSignal())).diff
    ).toContain('+new')
  })
})
