import { z } from 'zod'
import { resolveProjectPath } from '../infrastructure/workspace/path-policy'
import { DEFAULT_TOOL_OUTPUT_LIMIT, jsonToolResult } from './tool-result'
import { defineTool } from './tool-spec'

const schema = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1).default('.'),
  limit: z.number().int().min(1).max(500).default(200)
})

export const globFilesTool = defineTool({
  name: 'glob_files',
  description:
    'Find files matching a glob. Git projects honor .gitignore; other directories are traversed safely.',
  inputSchema: schema,
  hasSideEffects: false,
  fileAccess: 'read',
  shellAccess: false,
  lockMode: 'read',
  timeoutMs: 30_000,
  maxOutputChars: DEFAULT_TOOL_OUTPUT_LIMIT,
  async prepare(input, { project }) {
    const path = await resolveProjectPath(project.rootPath, input.path)
    return {
      input: { ...input, path },
      access: [
        {
          kind: 'path',
          path,
          mode: 'read',
          directory: true,
          title: '查找目录文件',
          detail: `glob_files ${input.pattern} in ${input.path}`
        }
      ]
    }
  },
  async execute(input, { signal }, { project, files }) {
    return await files.globForTool({ projectRoot: project.rootPath, ...input, signal })
  },
  format: jsonToolResult
})
