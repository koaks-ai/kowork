import type { JsonValue, ToolProgress } from '@koaks/node'
import type { ProjectDto } from '@kowork/contracts'
import { z } from 'zod'
import type { GitService } from '../infrastructure/git/git-service'
import type { CommandRunner } from '../infrastructure/shell/command-runner'
import type { FileService } from '../infrastructure/workspace/file-service'
import { CoreError } from '../domain/errors'

export type ToolLockMode = 'read' | 'write'
export type ToolPathAccessMode = 'read' | 'write'

export type ToolAccess =
  | {
      kind: 'path'
      path: string
      mode: ToolPathAccessMode
      directory: boolean
      title: string
      detail: string
    }
  | { kind: 'shell'; command: string; cwd: string }

export interface ToolDependencies {
  project: ProjectDto
  files: FileService
  commands: CommandRunner
  git: GitService
}

export interface ToolCallContext {
  signal: AbortSignal
  reportProgress(progress: ToolProgress): Promise<void>
}

export interface PreparedToolCall<Input extends Record<string, unknown> = Record<string, unknown>> {
  input: Input
  access: ToolAccess[]
}

export interface ToolSpec<
  Input extends Record<string, unknown> = Record<string, unknown>,
  Output = unknown
> {
  name: string
  description: string
  inputSchema: z.ZodType<Input>
  hasSideEffects: boolean
  fileAccess: ToolPathAccessMode | null
  shellAccess: boolean
  lockMode: ToolLockMode
  timeoutMs: number
  maxOutputChars: number
  parse(raw: unknown): Input
  prepare(input: Input, dependencies: ToolDependencies): Promise<PreparedToolCall<Input>>
  execute(input: Input, context: ToolCallContext, dependencies: ToolDependencies): Promise<Output>
  format(output: Output): string | JsonValue
}

interface ToolDefinition<Input extends Record<string, unknown>, Output> {
  name: string
  description: string
  inputSchema: z.ZodType<Input>
  hasSideEffects: boolean
  fileAccess: ToolPathAccessMode | null
  shellAccess: boolean
  lockMode: ToolLockMode
  timeoutMs: number
  maxOutputChars: number
  prepare(
    input: Input,
    dependencies: ToolDependencies
  ): PreparedToolCall<Input> | Promise<PreparedToolCall<Input>>
  execute(
    input: Input,
    context: ToolCallContext,
    dependencies: ToolDependencies
  ): Output | Promise<Output>
  format(output: Output): string | JsonValue
}

function parseInput<Input extends Record<string, unknown>>(
  schema: z.ZodType<Input>,
  raw: unknown
): Input {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new CoreError(
      'invalid_tool_input',
      parsed.error.issues.map((issue) => issue.message).join('; ')
    )
  }
  return parsed.data
}

export function defineTool<Input extends Record<string, unknown>, Output>(
  definition: ToolDefinition<Input, Output>
): ToolSpec<Input, Output> {
  return {
    ...definition,
    inputSchema: definition.inputSchema,
    parse: (raw) => parseInput(definition.inputSchema, raw),
    prepare: async (input, dependencies) =>
      await definition.prepare(parseInput(definition.inputSchema, input), dependencies),
    execute: async (input, context, dependencies) =>
      await definition.execute(parseInput(definition.inputSchema, input), context, dependencies),
    format: (output) => definition.format(output)
  }
}
