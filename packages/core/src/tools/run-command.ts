import { z } from 'zod'
import { resolveProjectPath } from '../infrastructure/workspace/path-policy'
import { DEFAULT_TOOL_OUTPUT_LIMIT, jsonToolResult } from './tool-result'
import { defineTool } from './tool-spec'

const schema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1).default('.'),
  timeoutMs: z.number().int().min(1).max(600_000).default(120_000)
})

export const runCommandTool = defineTool({
  name: 'run_command',
  description:
    'Run a non-interactive shell command as the current system user. The cwd does not restrict filesystem access.',
  inputSchema: schema,
  hasSideEffects: true,
  fileAccess: null,
  shellAccess: true,
  lockMode: 'write',
  timeoutMs: 610_000,
  maxOutputChars: DEFAULT_TOOL_OUTPUT_LIMIT,
  async prepare(input, { project }) {
    const cwd = await resolveProjectPath(project.rootPath, input.cwd)
    return {
      input: { ...input, cwd },
      access: [{ kind: 'shell', command: input.command, cwd }]
    }
  },
  async execute(input, context, { commands }) {
    return await commands.run({ ...input, ...context })
  },
  format: jsonToolResult
})
