import { z } from 'zod'
import { DEFAULT_TOOL_OUTPUT_LIMIT, jsonToolResult } from './tool-result'
import { defineTool } from './tool-spec'

const schema = z.object({})

export const gitStatusTool = defineTool({
  name: 'git_status',
  description: 'Return structured staged and worktree status for the project repository.',
  inputSchema: schema,
  hasSideEffects: false,
  fileAccess: 'read',
  shellAccess: false,
  lockMode: 'read',
  timeoutMs: 30_000,
  maxOutputChars: DEFAULT_TOOL_OUTPUT_LIMIT,
  prepare(input, { project }) {
    return {
      input,
      access: [
        {
          kind: 'path',
          path: project.rootPath,
          mode: 'read',
          directory: true,
          title: '读取 Git 状态',
          detail: 'git_status'
        }
      ]
    }
  },
  async execute(_input, { signal }, { project, git }) {
    return { changes: await git.status(project, signal) }
  },
  format: jsonToolResult
})
