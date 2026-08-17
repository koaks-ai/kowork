import { z } from 'zod'
import { resolveProjectPath } from '../infrastructure/workspace/path-policy'
import { DEFAULT_TOOL_OUTPUT_LIMIT, jsonToolResult } from './tool-result'
import { defineTool } from './tool-spec'

const schema = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1).default('.'),
  glob: z.string().min(1).optional(),
  caseSensitive: z.boolean().default(false),
  context: z.number().int().min(0).max(20).default(0),
  limit: z.number().int().min(1).max(200).default(200)
})

export const searchFilesTool = defineTool({
  name: 'search_files',
  description:
    'Search text files using a regular expression, with optional glob filtering and surrounding lines.',
  inputSchema: schema,
  hasSideEffects: false,
  fileAccess: 'read',
  shellAccess: false,
  lockMode: 'read',
  timeoutMs: 60_000,
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
          title: '搜索目录内容',
          detail: `search_files ${input.pattern} in ${input.path}`
        }
      ]
    }
  },
  async execute(input, { signal }, { project, files }) {
    return await files.searchForTool({ projectRoot: project.rootPath, ...input, signal })
  },
  format: jsonToolResult
})
