import { z } from 'zod'
import { resolveProjectPath } from '../infrastructure/workspace/path-policy'
import { DEFAULT_TOOL_OUTPUT_LIMIT, jsonToolResult } from './tool-result'
import { defineTool } from './tool-spec'

const schema = z.object({
  path: z.string().min(1),
  content: z.string()
})

export const writeFileTool = defineTool({
  name: 'write_file',
  description:
    'Create or completely overwrite one text file atomically. Prefer edit_file for focused changes.',
  inputSchema: schema,
  hasSideEffects: true,
  fileAccess: 'write',
  shellAccess: false,
  lockMode: 'write',
  timeoutMs: 30_000,
  maxOutputChars: DEFAULT_TOOL_OUTPUT_LIMIT,
  async prepare(input, { project }) {
    const path = await resolveProjectPath(project.rootPath, input.path, true)
    return {
      input: { ...input, path },
      access: [
        {
          kind: 'path',
          path,
          mode: 'write',
          directory: false,
          title: '写入文件',
          detail: `write_file ${input.path}`
        }
      ]
    }
  },
  async execute(input, { signal }, { project, files }) {
    return await files.writeForTool({ projectRoot: project.rootPath, ...input, signal })
  },
  format: jsonToolResult
})
