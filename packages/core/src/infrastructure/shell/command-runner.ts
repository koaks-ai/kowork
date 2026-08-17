import { spawn, type ChildProcess } from 'node:child_process'
import type { ToolProgress } from '@koaks/node'
import { CoreError } from '../../domain/errors'

const MAX_CAPTURE_CHARS = 64_000
const MAX_PROGRESS_CHARS = 256_000
const TERMINATION_GRACE_MS = 2_000

const isSensitiveEnvironmentKey = (key: string): boolean =>
  /(?:^|_)(?:API_?KEY|ACCESS_?KEY|ACCESS_?TOKEN|TOKEN|SECRET|PASSWORD|PRIVATE_?KEY|CREDENTIALS?)$/iu.test(
    key
  )

function shellEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !isSensitiveEnvironmentKey(key))
  )
}

function compact(value: string): string {
  if (value.length <= MAX_CAPTURE_CHARS) return value
  const marker = '\n\n[... command output truncated ...]\n\n'
  const headLength = 16_000
  const tailLength = MAX_CAPTURE_CHARS - marker.length - headLength
  return `${value.slice(0, headLength)}${marker}${value.slice(-tailLength)}`
}

function terminateProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    const taskkill = spawn(
      'taskkill',
      ['/pid', String(child.pid), '/t', ...(signal === 'SIGKILL' ? ['/f'] : [])],
      { stdio: 'ignore', windowsHide: true }
    )
    taskkill.once('error', () => child.kill(signal))
    taskkill.once('close', (code) => {
      if (code !== 0) child.kill(signal)
    })
    taskkill.unref()
    return
  }
  try {
    process.kill(-child.pid, signal)
    return
  } catch {
    // Fall back to the direct child when the process group has already exited.
  }
  child.kill(signal)
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  truncated: boolean
  originalChars: number
}

function failureMessage(prefix: string, result: CommandResult): string {
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
  return compact(`${prefix}${output ? `\n\n${output}` : ''}`)
}

export class CommandRunner {
  async run(input: {
    command: string
    cwd: string
    timeoutMs: number
    signal: AbortSignal
    reportProgress: (progress: ToolProgress) => Promise<void>
  }): Promise<CommandResult> {
    if (input.signal.aborted) {
      throw new CoreError('tool_cancelled', 'Command was cancelled before it started')
    }
    const shell =
      process.platform === 'win32'
        ? (process.env.ComSpec ?? 'cmd.exe')
        : (process.env.SHELL ?? '/bin/sh')
    const args =
      process.platform === 'win32' ? ['/d', '/s', '/c', input.command] : ['-c', input.command]

    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(shell, args, {
        cwd: input.cwd,
        env: shellEnvironment(),
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      let originalChars = 0
      let progressChars = 0
      let progressTruncated = false
      let termination: 'cancelled' | 'timeout' | undefined
      let progressQueue = Promise.resolve()
      let progressError: unknown
      let forceKillTimer: ReturnType<typeof setTimeout> | undefined

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
        originalChars += text.length
        if (stream === 'stdout') stdout = compact(stdout + text)
        else stderr = compact(stderr + text)

        if (progressTruncated) return
        const remaining = MAX_PROGRESS_CHARS - progressChars
        if (remaining > 0) {
          const visible = text.slice(0, remaining)
          progressChars += visible.length
          if (visible) enqueueProgress({ type: 'output', stream, text: visible })
        }
        if (text.length > remaining) {
          progressTruncated = true
          enqueueProgress({
            type: 'status',
            message: `[stream output truncated after ${MAX_PROGRESS_CHARS} characters]`
          })
        }
      }
      const terminate = (reason: 'cancelled' | 'timeout'): void => {
        if (termination) return
        termination = reason
        terminateProcessTree(child, 'SIGTERM')
        forceKillTimer = setTimeout(
          () => terminateProcessTree(child, 'SIGKILL'),
          TERMINATION_GRACE_MS
        )
      }
      const abort = (): void => terminate('cancelled')
      const timeout = setTimeout(() => terminate('timeout'), input.timeoutMs)
      input.signal.addEventListener('abort', abort, { once: true })

      child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk))
      child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk))
      child.once('error', (error) => {
        clearTimeout(timeout)
        if (forceKillTimer) clearTimeout(forceKillTimer)
        input.signal.removeEventListener('abort', abort)
        reject(error)
      })
      child.once('close', (code, signal) => {
        clearTimeout(timeout)
        if (forceKillTimer) clearTimeout(forceKillTimer)
        input.signal.removeEventListener('abort', abort)
        const result: CommandResult = {
          stdout,
          stderr,
          exitCode: code,
          signal,
          truncated: originalChars > stdout.length + stderr.length || progressTruncated,
          originalChars
        }
        enqueueProgress({
          type: 'status',
          message: `[exit code: ${code ?? 'none'}${signal ? `, signal: ${signal}` : ''}]`
        })
        void progressQueue.then(() => {
          if (progressError) {
            reject(progressError)
          } else if (termination === 'timeout') {
            reject(
              new CoreError(
                'command_timed_out',
                failureMessage(`Command timed out after ${input.timeoutMs} ms`, result),
                result
              )
            )
          } else if (termination === 'cancelled') {
            reject(
              new CoreError(
                'tool_cancelled',
                failureMessage('Command was cancelled', result),
                result
              )
            )
          } else if (code !== 0) {
            reject(
              new CoreError(
                'command_failed',
                failureMessage(`Command exited with code ${code ?? 'none'}`, result),
                result
              )
            )
          } else {
            resolve(result)
          }
        }, reject)
      })
    })
  }
}
