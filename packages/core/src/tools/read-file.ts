import { z } from 'zod'
import { resolveProjectPath } from '../infrastructure/workspace/path-policy'
import { DEFAULT_TOOL_OUTPUT_LIMIT, jsonToolResult } from './tool-result'
import { defineTool } from './tool-spec'

const schema = z.object({
  path: z.string().min(1),
  offset: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(2_000).default(400)
})

export const readFileTool = defineTool({
  name: 'read_file',
  description:
    'Read a UTF-8 text file with one-based line numbers. Binary files and files over 2 MiB are rejected.',
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
          directory: false,
          title: '读取文件',
          detail: `read_file ${input.path}`
        }
      ]
    }
  },
  async execute(input, { signal }, { project, files }) {
    return await files.readForTool({ projectRoot: project.rootPath, ...input, signal })
  },
  format: jsonToolResult
})
