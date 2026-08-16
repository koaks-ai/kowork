import { spawn } from 'node:child_process'
import type { GitChangeDto, GitDiffDto, GitSummaryDto, ProjectDto } from '@kowork/contracts'
import { CoreError } from '../../domain/errors'

async function git(rootPath: string, args: string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn('git', ['-C', rootPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new CoreError('git_error', stderr.trim() || `git exited with ${code}`))
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
  async status(project: ProjectDto): Promise<GitChangeDto[]> {
    try {
      const output = await git(project.rootPath, ['status', '--porcelain=v1', '-z'])
      return output
        .split('\0')
        .filter(Boolean)
        .map((line) => ({
          path: line.slice(3),
          indexStatus: line[0] ?? ' ',
          worktreeStatus: line[1] ?? ' '
        }))
    } catch (error) {
      if (error instanceof CoreError && /not a git repository/i.test(error.message)) return []
      throw error
    }
  }

  async summary(project: ProjectDto): Promise<GitSummaryDto> {
    try {
      const branch = (await git(project.rootPath, ['branch', '--show-current'])).trim() || null
      let numstat: string
      try {
        numstat = await git(project.rootPath, ['diff', '--numstat', 'HEAD', '--'])
      } catch (error) {
        if (
          !(error instanceof CoreError) ||
          !/ambiguous argument|bad revision|unknown revision/i.test(error.message)
        )
          throw error
        const [staged, unstaged] = await Promise.all([
          git(project.rootPath, ['diff', '--numstat', '--cached', '--']),
          git(project.rootPath, ['diff', '--numstat', '--'])
        ])
        numstat = `${staged}\n${unstaged}`
      }
      return { branch, ...summarizeNumstat(numstat) }
    } catch (error) {
      if (error instanceof CoreError && /not a git repository/i.test(error.message))
        return { branch: null, additions: 0, deletions: 0 }
      throw error
    }
  }

  async diff(project: ProjectDto, relativePath?: string): Promise<GitDiffDto> {
    try {
      const args = ['diff', '--no-ext-diff']
      if (relativePath) args.push('--', relativePath)
      return { path: relativePath ?? null, diff: await git(project.rootPath, args) }
    } catch (error) {
      if (error instanceof CoreError && /not a git repository/i.test(error.message))
        return { path: relativePath ?? null, diff: '' }
      throw error
    }
  }
}
