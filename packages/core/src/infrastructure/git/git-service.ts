import { spawn } from 'node:child_process'
import type { GitChangeDto, GitDiffDto, GitSummaryDto, ProjectDto } from '@kowork/contracts'
import { CoreError } from '../../domain/errors'

export type GitDiffMode = 'unstaged' | 'staged' | 'head'

interface GitOutput {
  stdout: string
  originalChars: number
  truncated: boolean
}

const MAX_GIT_CAPTURE_CHARS = 512_000

function compactOutput(output: string): string {
  if (output.length <= MAX_GIT_CAPTURE_CHARS) return output
  const head = output.slice(0, 128_000)
  const tail = output.slice(-(MAX_GIT_CAPTURE_CHARS - head.length - 40))
  return `${head}\n\n[... git output truncated ...]\n\n${tail}`
}

async function git(rootPath: string, args: string[], signal?: AbortSignal): Promise<GitOutput> {
  return await new Promise<GitOutput>((resolve, reject) => {
    const child = spawn('git', ['-C', rootPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(signal ? { signal } : {})
    })
    let stdout = ''
    let stderr = ''
    let stdoutChars = 0
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stdoutChars += text.length
      stdout = compactOutput(stdout + text)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = compactOutput(stderr + chunk.toString('utf8'))
    })
    child.once('error', (error) => {
      if (signal?.aborted) {
        reject(
          new CoreError(
            'tool_cancelled',
            typeof signal.reason === 'string' ? signal.reason : 'Git operation was cancelled'
          )
        )
      } else {
        reject(error)
      }
    })
    child.once('close', (code) => {
      if (code === 0) {
        resolve({ stdout, originalChars: stdoutChars, truncated: stdoutChars > stdout.length })
      } else {
        reject(new CoreError('git_error', stderr.trim() || `git exited with ${code}`))
      }
    })
  })
}

function summarizeNumstat(output: string): Pick<GitSummaryDto, 'additions' | 'deletions'> {
  let additions = 0
  let deletions = 0
  for (const line of output.split('\n')) {
    const [added, deleted] = line.split('\t')
    if (/^\d+$/u.test(added ?? '')) additions += Number(added)
    if (/^\d+$/u.test(deleted ?? '')) deletions += Number(deleted)
  }
  return { additions, deletions }
}

export class GitService {
  async status(project: ProjectDto, signal?: AbortSignal): Promise<GitChangeDto[]> {
    try {
      const result = await git(project.rootPath, ['status', '--porcelain=v1', '-z'], signal)
      if (result.truncated)
        throw new CoreError('git_output_too_large', 'Git status output is too large')
      const records = result.stdout.split('\0').filter(Boolean)
      const changes: GitChangeDto[] = []
      for (let index = 0; index < records.length; index += 1) {
        const line = records[index]!
        changes.push({
          path: line.slice(3),
          indexStatus: line[0] ?? ' ',
          worktreeStatus: line[1] ?? ' '
        })
        if (line[0] === 'R' || line[0] === 'C' || line[1] === 'R' || line[1] === 'C') {
          index += 1
        }
      }
      return changes
    } catch (error) {
      if (error instanceof CoreError && /not a git repository/iu.test(error.message)) return []
      throw error
    }
  }

  async summary(project: ProjectDto): Promise<GitSummaryDto> {
    try {
      const branch =
        (await git(project.rootPath, ['branch', '--show-current'])).stdout.trim() || null
      let numstat: string
      try {
        numstat = (await git(project.rootPath, ['diff', '--numstat', 'HEAD', '--'])).stdout
      } catch (error) {
        if (
          !(error instanceof CoreError) ||
          !/ambiguous argument|bad revision|unknown revision/iu.test(error.message)
        ) {
          throw error
        }
        const [staged, unstaged] = await Promise.all([
          git(project.rootPath, ['diff', '--numstat', '--cached', '--']),
          git(project.rootPath, ['diff', '--numstat', '--'])
        ])
        numstat = `${staged.stdout}\n${unstaged.stdout}`
      }
      return { branch, ...summarizeNumstat(numstat) }
    } catch (error) {
      if (error instanceof CoreError && /not a git repository/iu.test(error.message)) {
        return { branch: null, additions: 0, deletions: 0 }
      }
      throw error
    }
  }

  async diff(
    project: ProjectDto,
    relativePath?: string,
    mode: GitDiffMode = 'unstaged',
    signal?: AbortSignal
  ): Promise<GitDiffDto & { mode: GitDiffMode; truncated: boolean; originalChars: number }> {
    try {
      const args = ['diff', '--no-ext-diff']
      if (mode === 'staged') args.push('--cached')
      if (mode === 'head') args.push('HEAD')
      if (relativePath) args.push('--', relativePath)
      const result = await git(project.rootPath, args, signal)
      return {
        path: relativePath ?? null,
        diff: result.stdout,
        mode,
        truncated: result.truncated,
        originalChars: result.originalChars
      }
    } catch (error) {
      if (
        mode === 'head' &&
        error instanceof CoreError &&
        /ambiguous argument|bad revision|unknown revision/iu.test(error.message)
      ) {
        const [staged, unstaged] = await Promise.all([
          this.diff(project, relativePath, 'staged', signal),
          this.diff(project, relativePath, 'unstaged', signal)
        ])
        const combined = `${staged.diff}${staged.diff && unstaged.diff ? '\n' : ''}${unstaged.diff}`
        return {
          path: relativePath ?? null,
          diff: compactOutput(combined),
          mode,
          truncated:
            staged.truncated || unstaged.truncated || combined.length > MAX_GIT_CAPTURE_CHARS,
          originalChars: staged.originalChars + unstaged.originalChars
        }
      }
      if (error instanceof CoreError && /not a git repository/iu.test(error.message)) {
        return {
          path: relativePath ?? null,
          diff: '',
          mode,
          truncated: false,
          originalChars: 0
        }
      }
      throw error
    }
  }
}
