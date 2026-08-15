import { spawn } from 'node:child_process'
import type { ProjectDto, ThreadDto } from '@kowork/contracts'
import type { ApprovalService } from '../../application/approval-service'
import type { CoreEventBus } from '../../application/event-bus'

const isSensitiveEnvironmentKey = (key: string): boolean =>
  /(?:^|_)(?:API_?KEY|ACCESS_?TOKEN|SECRET|PASSWORD)$/iu.test(key)

function shellEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !isSensitiveEnvironmentKey(key))
  )
}

export class CommandRunner {
  constructor(
    private readonly approvals: ApprovalService,
    private readonly events: CoreEventBus
  ) {}

  async run(input: {
    project: ProjectDto
    thread: ThreadDto
    runId: string
    executionId: string
    command: string
    cwd: string
    signal: AbortSignal
  }): Promise<string> {
    const cwd = await this.approvals.authorizeShell(input)
    const shell =
      process.platform === 'win32'
        ? (process.env.ComSpec ?? 'cmd.exe')
        : (process.env.SHELL ?? '/bin/zsh')
    const args =
      process.platform === 'win32' ? ['/d', '/s', '/c', input.command] : ['-lc', input.command]
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(shell, args, {
        cwd,
        env: shellEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let modelOutput = ''
      const append = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
        const text = chunk.toString('utf8')
        this.events.publish({
          projectId: input.project.id,
          threadId: input.thread.id,
          runId: input.runId,
          type: 'run.tool-output',
          payload: {
            executionId: input.executionId,
            toolName: 'run_command',
            stream,
            text,
            command: input.command
          }
        })
        modelOutput += text
        if (modelOutput.length > 128 * 1024) modelOutput = modelOutput.slice(-128 * 1024)
      }
      child.stdout.on('data', (chunk: Buffer) => {
        append('stdout', chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        append('stderr', chunk)
      })
      const abort = (): void => {
        child.kill('SIGTERM')
      }
      input.signal.addEventListener('abort', abort, { once: true })
      child.once('error', reject)
      child.once('close', (code, signal) => {
        input.signal.removeEventListener('abort', abort)
        const suffix = `\n[exit code: ${code ?? 'none'}${signal ? `, signal: ${signal}` : ''}]`
        this.events.publish({
          projectId: input.project.id,
          threadId: input.thread.id,
          runId: input.runId,
          type: 'run.tool-output',
          payload: {
            executionId: input.executionId,
            toolName: 'run_command',
            stream: 'status',
            text: suffix,
            command: input.command
          }
        })
        resolve(modelOutput + suffix)
      })
    })
  }
}
