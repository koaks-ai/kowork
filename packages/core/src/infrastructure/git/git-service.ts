import { spawn } from 'node:child_process'
import type { GitChangeDto, GitDiffDto, ProjectDto } from '@kowork/contracts'
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
