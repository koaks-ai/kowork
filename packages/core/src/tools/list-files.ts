import { z } from 'zod'
import { resolveProjectPath } from '../infrastructure/workspace/path-policy'
import { DEFAULT_TOOL_OUTPUT_LIMIT, jsonToolResult } from './tool-result'
import { defineTool } from './tool-spec'

const schema = z.object({
  path: z.string().min(1).default('.'),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(500).default(200)
})

export const listFilesTool = defineTool({
  name: 'list_files',
  description: 'List one directory with stable ordering and pagination. The listing is shallow.',
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
          title: '读取目录',
          detail: `list_files ${input.path}`
        }
      ]
    }
  },
  async execute(input, { signal }, { project, files }) {
    return await files.listForTool({ projectRoot: project.rootPath, ...input, signal })
  },
  format: jsonToolResult
})
