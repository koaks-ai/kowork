import { spawn } from 'node:child_process'
import type { ToolProgress } from '@koaks/node'

const isSensitiveEnvironmentKey = (key: string): boolean =>
  /(?:^|_)(?:API_?KEY|ACCESS_?TOKEN|SECRET|PASSWORD)$/iu.test(key)

function shellEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !isSensitiveEnvironmentKey(key))
  )
}

export class CommandRunner {
  async run(input: {
    command: string
    cwd: string
    signal: AbortSignal
    reportProgress: (progress: ToolProgress) => Promise<void>
  }): Promise<string> {
    const shell =
      process.platform === 'win32'
        ? (process.env.ComSpec ?? 'cmd.exe')
        : (process.env.SHELL ?? '/bin/zsh')
    const args =
      process.platform === 'win32' ? ['/d', '/s', '/c', input.command] : ['-lc', input.command]
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(shell, args, {
        cwd: input.cwd,
        env: shellEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let modelOutput = ''
      let progressQueue = Promise.resolve()
      let progressError: unknown
      const enqueueProgress = (progress: ToolProgress): void => {
        progressQueue = progressQueue.then(async () => {
          if (progressError) return
          try {
            await input.reportProgress(progress)
          } catch (error) {
            progressError = error
          }
        })
      }
      const append = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
        const text = chunk.toString('utf8')
        enqueueProgress({ type: 'output', stream, text })
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
        enqueueProgress({ type: 'status', message: suffix })
        void progressQueue.then(
          () => (progressError ? reject(progressError) : resolve(modelOutput + suffix)),
          (error) => reject(error)
        )
      })
    })
  }
}
